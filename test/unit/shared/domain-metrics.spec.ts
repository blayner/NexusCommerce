import {
  OrderCancelledEvent,
  OrderPlacedEvent,
} from '../../../src/modules/order/domain/events/order.events';
import { PaymentService } from '../../../src/modules/payment/application/services/payment.service';
import { ProcessPaymentCommand } from '../../../src/modules/payment/application/commands/process-payment.command';
import { CreditCardStrategy } from '../../../src/modules/payment/domain/strategies/credit-card.strategy';
import { PaymentStrategyResolver } from '../../../src/modules/payment/domain/strategies/payment-strategy.resolver';
import { PixStrategy } from '../../../src/modules/payment/domain/strategies/pix.strategy';
import { InMemoryPaymentRepository } from '../../../src/modules/payment/infrastructure/adapters/in-memory-payment.repository';
import { instrumentJob } from '../../../src/shared/application/app-metrics.port';
import { EventBus } from '../../../src/shared/application/event-bus';
import { cacheNamespace } from '../../../src/shared/infrastructure/cache/cache.service';
import { InMemoryCacheService } from '../../../src/shared/infrastructure/cache/in-memory-cache.service';
import { OrderMetricsSubscriber } from '../../../src/shared/infrastructure/metrics/order-metrics.subscriber';
import { PrometheusAppMetrics } from '../../../src/shared/infrastructure/metrics/prometheus-app-metrics';
import { counterValue, histogramCount } from './metrics-test-utils';

const customer = { customerId: 'c-1', customerEmail: 'ana@nexus.test' };

describe('Domain and runtime metrics', () => {
  let metrics: PrometheusAppMetrics;

  beforeEach(() => {
    metrics = new PrometheusAppMetrics();
  });

  describe('OrderMetricsSubscriber', () => {
    it('counts order transitions from domain events, including the cancelled-from status', async () => {
      const bus = new EventBus();
      const subscriber = new OrderMetricsSubscriber(bus, metrics);
      subscriber.onModuleInit();

      await bus.publish(
        new OrderPlacedEvent('o-1', {
          ...customer,
          totalInCents: 1000,
          currency: 'BRL',
          itemCount: 1,
        }),
      );
      await bus.publish(
        new OrderCancelledEvent('o-1', {
          ...customer,
          reason: 'changed mind',
          previousStatus: 'PAID',
        }),
      );

      expect(await counterValue(metrics.orderTransitions, { transition: 'placed' })).toBe(1);
      expect(await counterValue(metrics.orderTransitions, { transition: 'cancelled' })).toBe(1);
      expect(await counterValue(metrics.orderCancellations, { from_status: 'PAID' })).toBe(1);

      subscriber.onModuleDestroy();
      await bus.publish(
        new OrderPlacedEvent('o-2', {
          ...customer,
          totalInCents: 1000,
          currency: 'BRL',
          itemCount: 1,
        }),
      );
      expect(await counterValue(metrics.orderTransitions, { transition: 'placed' })).toBe(1);
    });
  });

  describe('payment attempts', () => {
    it('counts each charge attempt by strategy and outcome', async () => {
      const resolver = new PaymentStrategyResolver([
        new CreditCardStrategy(),
        new PixStrategy({ key: 'pix@shop.dev', merchantName: 'Nexus', merchantCity: 'Sao Paulo' }),
      ]);
      const service = new PaymentService(
        new InMemoryPaymentRepository(),
        resolver,
        new EventBus(),
        metrics,
      );
      const charge = (orderId: string, cardToken: string) =>
        service.process(
          new ProcessPaymentCommand(
            orderId,
            'c-1',
            30_000,
            'BRL',
            { type: 'CREDIT_CARD', cardToken, installments: 1 },
            `order:${orderId}`,
          ),
        );

      await charge('o-1', 'tok_visa_4242');
      await charge('o-2', 'tok_insufficient_funds');
      await charge('o-1', 'tok_visa_4242'); // idempotent replay: no new attempt

      expect(
        await counterValue(metrics.paymentAttempts, { method: 'credit_card', outcome: 'approved' }),
      ).toBe(1);
      expect(
        await counterValue(metrics.paymentAttempts, { method: 'credit_card', outcome: 'declined' }),
      ).toBe(1);
    });
  });

  describe('cache lookups', () => {
    it('labels hits and misses by key namespace, never by id', async () => {
      class InstrumentedCache extends InMemoryCacheService {
        constructor() {
          super();
          this.metrics = metrics;
        }
      }
      const cache = new InstrumentedCache();
      const load = jest.fn().mockResolvedValue({ id: 'p-1' });

      await cache.wrap('catalog:product:p-1', 60, load);
      await cache.wrap('catalog:product:p-1', 60, load);

      expect(load).toHaveBeenCalledTimes(1);
      const product = { namespace: 'catalog:product' };
      expect(await counterValue(metrics.cacheLookups, { ...product, result: 'miss' })).toBe(1);
      expect(await counterValue(metrics.cacheLookups, { ...product, result: 'hit' })).toBe(1);
      expect(cacheNamespace('catalog:search:9f86d081')).toBe('catalog:search');
    });
  });

  describe('instrumentJob', () => {
    it('records completed and failed attempts and re-throws failures for BullMQ retries', async () => {
      await instrumentJob(metrics, 'notifications', async () => 'sent');
      await expect(
        instrumentJob(metrics, 'notifications', async () => {
          throw new Error('provider down');
        }),
      ).rejects.toThrow('provider down');

      const queue = { queue: 'notifications' };
      expect(await counterValue(metrics.jobs, { ...queue, outcome: 'completed' })).toBe(1);
      expect(await counterValue(metrics.jobs, { ...queue, outcome: 'failed' })).toBe(1);
      expect(await histogramCount(metrics.jobDuration, { ...queue, outcome: 'failed' })).toBe(1);
    });
  });
});

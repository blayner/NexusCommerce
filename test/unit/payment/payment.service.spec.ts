import { EventBus } from '../../../src/shared/application/event-bus';
import { ProcessPaymentCommand } from '../../../src/modules/payment/application/commands/process-payment.command';
import { ConfirmProviderNotificationCommand } from '../../../src/modules/payment/application/commands/process-payment.command';
import { PaymentService } from '../../../src/modules/payment/application/services/payment.service';
import { PaymentStatus } from '../../../src/modules/payment/domain/entities/payment.entity';
import {
  PaymentApprovedEvent,
  PaymentFailedEvent,
} from '../../../src/modules/payment/domain/events/payment.events';
import { BoletoStrategy } from '../../../src/modules/payment/domain/strategies/boleto.strategy';
import { CreditCardStrategy } from '../../../src/modules/payment/domain/strategies/credit-card.strategy';
import { PaymentStrategyResolver } from '../../../src/modules/payment/domain/strategies/payment-strategy.resolver';
import { PixStrategy } from '../../../src/modules/payment/domain/strategies/pix.strategy';
import { PaymentMethodDetails } from '../../../src/modules/payment/domain/value-objects/payment-method.vo';
import { InMemoryPaymentRepository } from '../../../src/modules/payment/infrastructure/adapters/in-memory-payment.repository';

const CARD: PaymentMethodDetails = {
  type: 'CREDIT_CARD',
  cardToken: 'tok_visa_4242',
  installments: 3,
};

function command(
  overrides: Partial<{
    method: PaymentMethodDetails;
    key: string;
    amount: number;
    orderId: string;
  }> = {},
) {
  return new ProcessPaymentCommand(
    overrides.orderId ?? 'order-1',
    'customer-1',
    overrides.amount ?? 30_000,
    'BRL',
    overrides.method ?? CARD,
    overrides.key ?? 'order:order-1',
  );
}

describe('PaymentService', () => {
  let repository: InMemoryPaymentRepository;
  let eventBus: EventBus;
  let service: PaymentService;

  beforeEach(() => {
    repository = new InMemoryPaymentRepository();
    eventBus = new EventBus();
    const resolver = new PaymentStrategyResolver([
      new CreditCardStrategy(),
      new PixStrategy({ key: 'pix@shop.dev', merchantName: 'Nexus', merchantCity: 'Sao Paulo' }),
      new BoletoStrategy(),
    ]);
    service = new PaymentService(repository, resolver, eventBus);
  });

  it('approves card payments synchronously and publishes PaymentApproved', async () => {
    const approved = jest.fn();
    eventBus.subscribe(PaymentApprovedEvent.EVENT_NAME, approved);

    const result = await service.process(command());

    expect(result.ok && result.value.status).toBe(PaymentStatus.Approved);
    expect(approved).toHaveBeenCalledTimes(1);
  });

  it('records declines with the reason', async () => {
    const failed = jest.fn();
    eventBus.subscribe(PaymentFailedEvent.EVENT_NAME, failed);

    const result = await service.process(
      command({
        method: { type: 'CREDIT_CARD', cardToken: 'tok_insufficient_funds', installments: 1 },
      }),
    );

    expect(result.ok && result.value.status).toBe(PaymentStatus.Declined);
    expect(result.ok && result.value.declineReason).toBe('Insufficient funds');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('declines installments below the R$ 5,00 minimum', async () => {
    const result = await service.process(
      command({
        amount: 1_000,
        method: { type: 'CREDIT_CARD', cardToken: 'tok_visa_4242', installments: 3 },
      }),
    );
    expect(result.ok && result.value.status).toBe(PaymentStatus.Declined);
  });

  it('replays the same payment for a repeated idempotency key (no double charge)', async () => {
    const first = await service.process(command());
    const second = await service.process(command());

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.value.id).toBe(first.value.id);
    expect(repository.count).toBe(1);
  });

  it('rejects reusing a key for a different amount', async () => {
    await service.process(command());
    const reuse = await service.process(command({ amount: 99_999 }));
    expect(!reuse.ok && reuse.error.code).toBe('CONFLICT');
  });

  it('PIX stays pending with a BR Code until the webhook confirms it', async () => {
    const pending = await service.process(command({ method: { type: 'PIX' } }));
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.value.status).toBe(PaymentStatus.Pending);
    expect(pending.value.instructions?.copyAndPaste).toMatch(/^000201/);

    const confirmed = await service.confirmProviderNotification(
      new ConfirmProviderNotificationCommand(pending.value.providerReference!, 'APPROVED'),
    );
    expect(confirmed.ok && confirmed.value.status).toBe(PaymentStatus.Approved);

    // Provider retries the same webhook: still OK, no second event
    const approved = jest.fn();
    eventBus.subscribe(PaymentApprovedEvent.EVENT_NAME, approved);
    const replay = await service.confirmProviderNotification(
      new ConfirmProviderNotificationCommand(pending.value.providerReference!, 'APPROVED'),
    );
    expect(replay.ok).toBe(true);
    expect(approved).not.toHaveBeenCalled();
  });

  it('expires unpaid PIX charges', async () => {
    const pending = await service.process(command({ method: { type: 'PIX' } }));
    if (!pending.ok) throw new Error('setup failed');

    const expired = await service.expireOverduePayments(new Date(Date.now() + 31 * 60_000));
    expect(expired).toBe(1);
    expect((await repository.findById(pending.value.id))?.status).toBe(PaymentStatus.Expired);
  });

  it('refunds approved payments only', async () => {
    const pix = await service.process(
      command({ method: { type: 'PIX' }, key: 'k-pix', orderId: 'o-2' }),
    );
    if (!pix.ok) throw new Error('setup failed');
    expect((await service.refund(pix.value.id)).ok).toBe(false);

    const card = await service.process(command());
    if (!card.ok) throw new Error('setup failed');
    const refunded = await service.refund(card.value.id);
    expect(refunded.ok && refunded.value.status).toBe(PaymentStatus.Refunded);
  });

  it('validates boleto payer documents', async () => {
    const invalid = await service.process(
      command({
        method: { type: 'BOLETO', customerDocument: '111.111.111-11', customerName: 'Ana' },
      }),
    );
    expect(!invalid.ok && invalid.error.code).toBe('VALIDATION');

    const valid = await service.process(
      command({
        method: { type: 'BOLETO', customerDocument: '529.982.247-25', customerName: 'Ana' },
      }),
    );
    expect(valid.ok && valid.value.instructions?.digitableLine).toMatch(
      /^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/,
    );
  });
});

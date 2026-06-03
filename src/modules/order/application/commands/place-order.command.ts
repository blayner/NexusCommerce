import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '../../../../shared/application/event-bus';
import { err, ok, Result } from '../../../../shared/domain';
import { Order } from '../../domain/entities/order.entity';
import { CHECKOUT_SOURCE_PORT, CheckoutSourcePort } from '../../domain/ports/checkout-source.port';
import { ORDER_REPOSITORY, OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { ChargeOutcome, CheckoutPaymentMethod } from '../../domain/ports/payment-gateway.port';
import { OrderPlacementContext, OrderPlacementSaga } from '../sagas/order.saga';

export class PlaceOrderCommand {
  constructor(
    public readonly customerId: string,
    public readonly customerEmail: string,
    public readonly paymentMethod: CheckoutPaymentMethod,
    /** Optional `Idempotency-Key` header: retried checkouts return the original order. */
    public readonly idempotencyKey?: string,
  ) {}
}

export interface PlaceOrderResult {
  order: Order;
  charge: ChargeOutcome | null;
}

@Injectable()
export class PlaceOrderHandler {
  private readonly logger = new Logger(PlaceOrderHandler.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(CHECKOUT_SOURCE_PORT) private readonly checkout: CheckoutSourcePort,
    private readonly saga: OrderPlacementSaga,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<Result<PlaceOrderResult>> {
    if (command.idempotencyKey) {
      const existing = await this.orders.findByIdempotencyKey(command.idempotencyKey);
      if (existing && existing.isOwnedBy(command.customerId)) {
        return ok({ order: existing, charge: null });
      }
    }

    const content = await this.checkout.load(command.customerId);
    if (!content.ok) return content;

    const placed = Order.place({
      ...content.value,
      customerId: command.customerId,
      customerEmail: command.customerEmail,
      idempotencyKey: command.idempotencyKey ?? null,
    });
    if (!placed.ok) return placed;
    const order = placed.value;

    const confirmed = order.confirm();
    if (!confirmed.ok) return confirmed;
    await this.orders.save(order); // durable before touching other modules

    const context: OrderPlacementContext = {
      order,
      paymentMethod: command.paymentMethod,
      idempotencyKey: `order:${order.id}`,
    };
    const { result, execution } = await this.saga.run(context);

    if (!result.ok) {
      this.logger.warn(
        `Order ${order.id} failed at "${execution.failedStep}" (compensated: ${execution.compensatedSteps.join(', ') || 'none'})`,
      );
      const cancelled = order.cancel(`Checkout failed: ${result.error.message}`);
      if (!cancelled.ok)
        this.logger.error(`Could not cancel order ${order.id}: ${cancelled.error.message}`);
      await this.orders.save(order);
      await this.eventBus.publishAll(order.pullDomainEvents());
      return err(result.error.withDetails({ orderId: order.id }));
    }

    await this.orders.save(order);
    await this.eventBus.publishAll(order.pullDomainEvents());
    await this.checkout.complete(command.customerId);
    return ok({ order, charge: context.charge ?? null });
  }
}

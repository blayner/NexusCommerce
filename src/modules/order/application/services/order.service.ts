import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../../../shared/application/event-bus';
import { withOptimisticRetry } from '../../../../shared/application/optimistic-retry';
import { normalizePage, Paginated } from '../../../../shared/application/pagination';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { PaymentApprovedEvent, PaymentFailedEvent } from '../../../payment';
import { Order } from '../../domain/entities/order.entity';
import { INVENTORY_PORT, InventoryPort } from '../../domain/ports/inventory.port';
import { ORDER_REPOSITORY, OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { OrderStatusValue } from '../../domain/value-objects/order-status.vo';

/**
 * Order use cases that are not part of checkout, plus the reactions to payment events
 * (asynchronous settlement of PIX/boleto, expirations).
 */
@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderService.name);
  private readonly subscriptions: Array<() => void> = [];

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    private readonly eventBus: EventBus,
  ) {}

  onModuleInit(): void {
    this.subscriptions.push(
      this.eventBus.subscribe<PaymentApprovedEvent>(PaymentApprovedEvent.EVENT_NAME, (event) =>
        this.onPaymentApproved(event),
      ),
      this.eventBus.subscribe<PaymentFailedEvent>(PaymentFailedEvent.EVENT_NAME, (event) =>
        this.onPaymentFailed(event),
      ),
    );
  }

  onModuleDestroy(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
  }

  async getForUser(
    orderId: string,
    user: { userId: string; isAdmin: boolean },
  ): Promise<Result<Order>> {
    const order = await this.orders.findById(orderId);
    if (!order) return err(DomainError.notFound('Order', orderId));
    if (!user.isAdmin && !order.isOwnedBy(user.userId)) {
      // Don't reveal that someone else's order exists.
      return err(DomainError.notFound('Order', orderId));
    }
    return ok(order);
  }

  listForCustomer(customerId: string, page?: number, pageSize?: number): Promise<Paginated<Order>> {
    return this.orders.findByCustomer(customerId, normalizePage({ page, pageSize }));
  }

  ship(orderId: string, trackingCode: string): Promise<Result<Order>> {
    return this.transition(orderId, (order) => order.ship(trackingCode));
  }

  deliver(orderId: string): Promise<Result<Order>> {
    return this.transition(orderId, (order) => order.deliver());
  }

  /** PIX/boleto paid: confirm the order and turn the reservation into a sale. */
  async onPaymentApproved(event: PaymentApprovedEvent): Promise<void> {
    await withOptimisticRetry(async () => {
      const order = await this.orders.findById(event.payload.orderId);
      if (!order || order.status !== OrderStatusValue.PaymentPending) return; // card flow already settled

      const committed = await this.inventory.commit(order.stockLines);
      if (!committed.ok) {
        // Should not happen while the reservation is held; flag for manual follow-up.
        this.logger.error(
          `Order ${order.id}: payment approved but stock commit failed: ${committed.error.message}`,
        );
        return;
      }
      order.markInventory('COMMITTED');

      const approved = order.approvePayment();
      if (!approved.ok) throw new Error(approved.error.message);

      await this.orders.save(order);
      await this.eventBus.publishAll(order.pullDomainEvents());
    });
  }

  /** Payment declined/expired after the order was placed: cancel and free the stock. */
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    await withOptimisticRetry(async () => {
      const order = await this.orders.findById(event.payload.orderId);
      if (!order || order.status !== OrderStatusValue.PaymentPending) return;

      const rejected = order.rejectPayment(`Payment ${event.payload.reason}`);
      if (!rejected.ok) throw new Error(rejected.error.message);

      if (order.inventoryState === 'RESERVED') {
        const released = await this.inventory.release(order.stockLines);
        if (released.ok) order.markInventory('RELEASED');
        else
          this.logger.error(
            `Order ${order.id}: failed to release stock: ${released.error.message}`,
          );
      }

      await this.orders.save(order);
      await this.eventBus.publishAll(order.pullDomainEvents());
    });
  }

  private transition(
    orderId: string,
    change: (order: Order) => Result<void>,
  ): Promise<Result<Order>> {
    return withOptimisticRetry(async () => {
      const order = await this.orders.findById(orderId);
      if (!order) return err(DomainError.notFound('Order', orderId));

      const changed = change(order);
      if (!changed.ok) return changed;

      await this.orders.save(order);
      await this.eventBus.publishAll(order.pullDomainEvents());
      return ok(order);
    });
  }
}

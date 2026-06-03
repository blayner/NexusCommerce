import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '../../../../shared/application/event-bus';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { Order } from '../../domain/entities/order.entity';
import { INVENTORY_PORT, InventoryPort } from '../../domain/ports/inventory.port';
import { ORDER_REPOSITORY, OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { PAYMENT_GATEWAY_PORT, PaymentGatewayPort } from '../../domain/ports/payment-gateway.port';

export class CancelOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly requestedBy: { userId: string; isAdmin: boolean },
    public readonly reason: string,
  ) {}
}

@Injectable()
export class CancelOrderHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(PAYMENT_GATEWAY_PORT) private readonly payments: PaymentGatewayPort,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CancelOrderCommand): Promise<Result<Order>> {
    const order = await this.orders.findById(command.orderId);
    if (!order) return err(DomainError.notFound('Order', command.orderId));
    if (!command.requestedBy.isAdmin && !order.isOwnedBy(command.requestedBy.userId)) {
      return err(DomainError.forbidden('You can only cancel your own orders'));
    }

    const refundNeeded = order.requiresRefundOnCancel;
    const paymentId = order.paymentId;

    const cancelled = order.cancel(command.reason);
    if (!cancelled.ok) return cancelled;

    // Money first: if the refund fails nothing else changes and the user can retry.
    if (refundNeeded && paymentId) {
      const refunded = await this.payments.refund(paymentId);
      if (!refunded.ok) return refunded;
    }

    const compensation = await this.compensateInventory(order);
    if (!compensation.ok) return compensation;

    await this.orders.save(order);
    await this.eventBus.publishAll(order.pullDomainEvents());
    return ok(order);
  }

  private async compensateInventory(order: Order): Promise<Result<void>> {
    switch (order.inventoryState) {
      case 'RESERVED': {
        const released = await this.inventory.release(order.stockLines);
        if (released.ok) order.markInventory('RELEASED');
        return released;
      }
      case 'COMMITTED': {
        const restocked = await this.inventory.restock(order.stockLines);
        if (restocked.ok) order.markInventory('RESTOCKED');
        return restocked;
      }
      default:
        return ok(undefined);
    }
  }
}

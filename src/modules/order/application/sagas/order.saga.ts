import { Inject, Injectable } from '@nestjs/common';
import { SagaExecution, SagaOrchestrator, SagaStep } from '../../../../shared/application/saga';
import { DomainError, err, okVoid, Result } from '../../../../shared/domain';
import { Order } from '../../domain/entities/order.entity';
import { INVENTORY_PORT, InventoryPort } from '../../domain/ports/inventory.port';
import {
  ChargeOutcome,
  CheckoutPaymentMethod,
  PAYMENT_GATEWAY_PORT,
  PaymentGatewayPort,
} from '../../domain/ports/payment-gateway.port';

export interface OrderPlacementContext {
  order: Order;
  paymentMethod: CheckoutPaymentMethod;
  idempotencyKey: string;
  charge?: ChargeOutcome;
}

/**
 * Orchestrates the cross-module part of checkout:
 *
 *   1. reserve-inventory   (compensation: release reservation)
 *   2. charge-payment      (compensation: refund if money was captured)
 *   3. settle              (card approved -> PAID + commit stock; PIX/boleto -> stays PAYMENT_PENDING)
 *
 * The order aggregate itself is persisted by the caller before and after the saga, so a
 * crash mid-way leaves an order in CONFIRMED/PAYMENT_PENDING that can be reconciled.
 */
@Injectable()
export class OrderPlacementSaga {
  private readonly orchestrator: SagaOrchestrator<OrderPlacementContext>;

  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(PAYMENT_GATEWAY_PORT) private readonly payments: PaymentGatewayPort,
  ) {
    this.orchestrator = new SagaOrchestrator('order-placement', [
      this.reserveInventory(),
      this.chargePayment(),
      this.settle(),
    ]);
  }

  run(context: OrderPlacementContext): Promise<{ result: Result<void>; execution: SagaExecution }> {
    return this.orchestrator.run(context);
  }

  private reserveInventory(): SagaStep<OrderPlacementContext> {
    return {
      name: 'reserve-inventory',
      invoke: async ({ order }) => {
        const reserved = await this.inventory.reserve(order.stockLines);
        if (!reserved.ok) return reserved;
        order.markInventory('RESERVED');
        return okVoid();
      },
      compensate: async ({ order }) => {
        if (order.inventoryState !== 'RESERVED') return;
        const released = await this.inventory.release(order.stockLines);
        if (!released.ok) throw new Error(released.error.message);
        order.markInventory('RELEASED');
      },
    };
  }

  private chargePayment(): SagaStep<OrderPlacementContext> {
    return {
      name: 'charge-payment',
      invoke: async (context) => {
        const { order } = context;
        const charged = await this.payments.charge({
          orderId: order.id,
          customerId: order.customerId,
          amountInCents: order.totals.total.amountInCents,
          currency: order.totals.total.currency,
          method: context.paymentMethod,
          idempotencyKey: context.idempotencyKey,
        });
        if (!charged.ok) return charged;

        context.charge = charged.value;
        if (charged.value.status === 'DECLINED') {
          return err(
            DomainError.businessRule(`Payment declined: ${charged.value.reason}`, {
              orderId: order.id,
              paymentId: charged.value.paymentId,
            }),
          );
        }
        return order.requestPayment(charged.value.paymentId);
      },
      compensate: async ({ charge }) => {
        if (charge?.status !== 'APPROVED') return;
        const refunded = await this.payments.refund(charge.paymentId);
        if (!refunded.ok) throw new Error(refunded.error.message);
      },
    };
  }

  private settle(): SagaStep<OrderPlacementContext> {
    return {
      name: 'settle',
      invoke: async ({ order, charge }) => {
        if (charge?.status !== 'APPROVED') return okVoid(); // async methods settle via events

        const committed = await this.inventory.commit(order.stockLines);
        if (!committed.ok) return committed;
        order.markInventory('COMMITTED');
        return order.approvePayment();
      },
    };
  }
}

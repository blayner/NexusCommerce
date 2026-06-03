import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { OrderStatusValue as S } from '../value-objects/order-status.vo';

export enum OrderEvent {
  Confirm = 'CONFIRM',
  RequestPayment = 'REQUEST_PAYMENT',
  ApprovePayment = 'APPROVE_PAYMENT',
  RejectPayment = 'REJECT_PAYMENT',
  Ship = 'SHIP',
  Deliver = 'DELIVER',
  Cancel = 'CANCEL',
}

type TransitionTable = Readonly<Record<S, Readonly<Partial<Record<OrderEvent, S>>>>>;

/**
 * Single source of truth for the order lifecycle:
 *
 *   DRAFT            --CONFIRM-->          CONFIRMED
 *   CONFIRMED        --REQUEST_PAYMENT-->  PAYMENT_PENDING
 *   PAYMENT_PENDING  --APPROVE_PAYMENT-->  PAID
 *   PAYMENT_PENDING  --REJECT_PAYMENT-->   CANCELLED
 *   PAID             --SHIP-->             SHIPPED
 *   SHIPPED          --DELIVER-->          DELIVERED
 *   DRAFT | CONFIRMED | PAYMENT_PENDING | PAID  --CANCEL-->  CANCELLED
 *
 * Cancelling a PAID order triggers a refund; once SHIPPED it can no longer be cancelled.
 */
const TRANSITIONS: TransitionTable = {
  [S.Draft]: {
    [OrderEvent.Confirm]: S.Confirmed,
    [OrderEvent.Cancel]: S.Cancelled,
  },
  [S.Confirmed]: {
    [OrderEvent.RequestPayment]: S.PaymentPending,
    [OrderEvent.Cancel]: S.Cancelled,
  },
  [S.PaymentPending]: {
    [OrderEvent.ApprovePayment]: S.Paid,
    [OrderEvent.RejectPayment]: S.Cancelled,
    [OrderEvent.Cancel]: S.Cancelled,
  },
  [S.Paid]: {
    [OrderEvent.Ship]: S.Shipped,
    [OrderEvent.Cancel]: S.Cancelled,
  },
  [S.Shipped]: {
    [OrderEvent.Deliver]: S.Delivered,
  },
  [S.Delivered]: {},
  [S.Cancelled]: {},
};

export class OrderStateMachine {
  static transition(from: S, event: OrderEvent): Result<S> {
    const next = TRANSITIONS[from][event];
    if (!next) {
      return err(
        DomainError.invalidState(`Cannot ${event} an order that is ${from}`, {
          from,
          event,
          allowed: OrderStateMachine.allowedEvents(from),
        }),
      );
    }
    return ok(next);
  }

  static can(from: S, event: OrderEvent): boolean {
    return TRANSITIONS[from][event] !== undefined;
  }

  static allowedEvents(from: S): OrderEvent[] {
    return Object.keys(TRANSITIONS[from]) as OrderEvent[];
  }

  static isTerminal(status: S): boolean {
    return OrderStateMachine.allowedEvents(status).length === 0;
  }

  /** Every (from, event, to) triple – handy for docs and exhaustive tests. */
  static describe(): Array<{ from: S; event: OrderEvent; to: S }> {
    return (Object.keys(TRANSITIONS) as S[]).flatMap((from) =>
      (Object.entries(TRANSITIONS[from]) as Array<[OrderEvent, S]>).map(([event, to]) => ({
        from,
        event,
        to,
      })),
    );
  }
}

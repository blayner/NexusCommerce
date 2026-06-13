import { DomainEvent } from '../../../../shared/domain';

interface PaymentEventPayload {
  orderId: string;
  amountInCents: number;
  currency: string;
  method: string;
}

/** Money is confirmed (synchronously for cards, via webhook for PIX/boleto). */
export class PaymentApprovedEvent extends DomainEvent<PaymentEventPayload> {
  static readonly EVENT_NAME = 'payment.payment.approved';
  readonly eventName = PaymentApprovedEvent.EVENT_NAME;

  constructor(paymentId: string, payload: PaymentEventPayload) {
    super(paymentId, payload);
  }
}

export class PaymentFailedEvent extends DomainEvent<PaymentEventPayload & { reason: string }> {
  static readonly EVENT_NAME = 'payment.payment.failed';
  readonly eventName = PaymentFailedEvent.EVENT_NAME;

  constructor(paymentId: string, payload: PaymentEventPayload & { reason: string }) {
    super(paymentId, payload);
  }
}

export class PaymentRefundedEvent extends DomainEvent<PaymentEventPayload> {
  static readonly EVENT_NAME = 'payment.payment.refunded';
  readonly eventName = PaymentRefundedEvent.EVENT_NAME;

  constructor(paymentId: string, payload: PaymentEventPayload) {
    super(paymentId, payload);
  }
}

import { DomainEvent } from '../../../../shared/domain';

interface OrderEventBase {
  customerId: string;
  customerEmail: string;
}

export class OrderPlacedEvent extends DomainEvent<
  OrderEventBase & { totalInCents: number; currency: string; itemCount: number }
> {
  static readonly EVENT_NAME = 'order.order.placed';
  readonly eventName = OrderPlacedEvent.EVENT_NAME;

  constructor(
    orderId: string,
    payload: OrderEventBase & { totalInCents: number; currency: string; itemCount: number },
  ) {
    super(orderId, payload);
  }
}

export class OrderPaidEvent extends DomainEvent<
  OrderEventBase & { paymentId: string; totalInCents: number; currency: string }
> {
  static readonly EVENT_NAME = 'order.order.paid';
  readonly eventName = OrderPaidEvent.EVENT_NAME;

  constructor(
    orderId: string,
    payload: OrderEventBase & { paymentId: string; totalInCents: number; currency: string },
  ) {
    super(orderId, payload);
  }
}

export class OrderShippedEvent extends DomainEvent<OrderEventBase & { trackingCode: string }> {
  static readonly EVENT_NAME = 'order.order.shipped';
  readonly eventName = OrderShippedEvent.EVENT_NAME;

  constructor(orderId: string, payload: OrderEventBase & { trackingCode: string }) {
    super(orderId, payload);
  }
}

export class OrderDeliveredEvent extends DomainEvent<OrderEventBase> {
  static readonly EVENT_NAME = 'order.order.delivered';
  readonly eventName = OrderDeliveredEvent.EVENT_NAME;

  constructor(orderId: string, payload: OrderEventBase) {
    super(orderId, payload);
  }
}

export class OrderCancelledEvent extends DomainEvent<
  OrderEventBase & { reason: string; previousStatus: string }
> {
  static readonly EVENT_NAME = 'order.order.cancelled';
  readonly eventName = OrderCancelledEvent.EVENT_NAME;

  constructor(
    orderId: string,
    payload: OrderEventBase & { reason: string; previousStatus: string },
  ) {
    super(orderId, payload);
  }
}

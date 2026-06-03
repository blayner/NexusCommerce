import { DomainError, err, ok, Result, ValueObject } from '../../../../shared/domain';

export enum OrderStatusValue {
  Draft = 'DRAFT',
  Confirmed = 'CONFIRMED',
  PaymentPending = 'PAYMENT_PENDING',
  Paid = 'PAID',
  Shipped = 'SHIPPED',
  Delivered = 'DELIVERED',
  Cancelled = 'CANCELLED',
}

const TERMINAL = new Set<OrderStatusValue>([
  OrderStatusValue.Delivered,
  OrderStatusValue.Cancelled,
]);

export class OrderStatus extends ValueObject<{ value: OrderStatusValue }> {
  private constructor(value: OrderStatusValue) {
    super({ value });
  }

  static of(value: OrderStatusValue): OrderStatus {
    return new OrderStatus(value);
  }

  static parse(raw: string): Result<OrderStatus> {
    const value = Object.values(OrderStatusValue).find(
      (candidate) => (candidate as string) === raw,
    );
    return value
      ? ok(new OrderStatus(value))
      : err(DomainError.validation(`Unknown order status "${raw}"`));
  }

  get value(): OrderStatusValue {
    return this.props.value;
  }

  get isTerminal(): boolean {
    return TERMINAL.has(this.props.value);
  }

  is(...values: OrderStatusValue[]): boolean {
    return values.includes(this.props.value);
  }

  toString(): string {
    return this.props.value;
  }
}

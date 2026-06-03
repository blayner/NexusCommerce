import {
  AggregateBaseProps,
  AggregateRoot,
  combine,
  Currency,
  DomainError,
  err,
  Money,
  ok,
  okVoid,
  Result,
} from '../../../../shared/domain';
import {
  OrderCancelledEvent,
  OrderDeliveredEvent,
  OrderPaidEvent,
  OrderPlacedEvent,
  OrderShippedEvent,
} from '../events/order.events';
import { OrderEvent, OrderStateMachine } from '../services/order-state-machine';
import { OrderStatus, OrderStatusValue } from '../value-objects/order-status.vo';
import { OrderItem } from './order-item.entity';

/** Where the order's units are in the catalog: drives compensation on cancel. */
export type InventoryState = 'NONE' | 'RESERVED' | 'COMMITTED' | 'RELEASED' | 'RESTOCKED';

export interface StatusChange {
  from: OrderStatusValue | null;
  to: OrderStatusValue;
  event: OrderEvent | 'PLACE';
  reason?: string;
  at: Date;
}

export interface OrderTotals {
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
}

export interface OrderProps {
  customerId: string;
  customerEmail: string;
  items: OrderItem[];
  totals: OrderTotals;
  status: OrderStatus;
  couponCode: string | null;
  paymentId: string | null;
  trackingCode: string | null;
  cancellationReason: string | null;
  inventoryState: InventoryState;
  idempotencyKey: string | null;
  history: StatusChange[];
}

export interface PlaceOrderInput {
  customerId: string;
  customerEmail: string;
  currency: Currency;
  couponCode: string | null;
  idempotencyKey?: string | null;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unitPriceInCents: number;
    quantity: number;
  }>;
  subtotalInCents: number;
  discountInCents: number;
  shippingInCents: number;
  totalInCents: number;
}

const TRACKING_CODE = /^[A-Z]{2}\d{9}[A-Z]{2}$/; // UPU S10 format, e.g. "BR123456789BR"

/**
 * Order aggregate. Every status change goes through `OrderStateMachine` and is appended to
 * an audit trail; totals are validated on creation so an order can never disagree with its lines.
 */
export class Order extends AggregateRoot {
  private constructor(
    private props: OrderProps,
    base?: AggregateBaseProps,
  ) {
    super(base);
  }

  static place(input: PlaceOrderInput, now: Date = new Date()): Result<Order> {
    if (input.items.length === 0) {
      return err(DomainError.businessRule('An order must contain at least one item'));
    }

    const items = combine(
      input.items.map((item) => OrderItem.create({ ...item, currency: input.currency })),
    );
    if (!items.ok) return items;

    const totals: OrderTotals = {
      subtotal: Money.of(input.subtotalInCents, input.currency),
      discount: Money.of(input.discountInCents, input.currency),
      shipping: Money.of(input.shippingInCents, input.currency),
      total: Money.of(input.totalInCents, input.currency),
    };

    const linesTotal = Money.sum(
      items.value.map((item) => item.lineTotal),
      input.currency,
    );
    if (!linesTotal.equals(totals.subtotal)) {
      return err(DomainError.validation('Subtotal does not match the sum of the order lines'));
    }
    const expectedTotal = totals.subtotal.subtract(totals.discount).add(totals.shipping);
    if (!expectedTotal.equals(totals.total)) {
      return err(DomainError.validation('Total must equal subtotal - discount + shipping'));
    }

    return ok(
      new Order({
        customerId: input.customerId,
        customerEmail: input.customerEmail,
        items: items.value,
        totals,
        status: OrderStatus.of(OrderStatusValue.Draft),
        couponCode: input.couponCode,
        paymentId: null,
        trackingCode: null,
        cancellationReason: null,
        inventoryState: 'NONE',
        idempotencyKey: input.idempotencyKey ?? null,
        history: [{ from: null, to: OrderStatusValue.Draft, event: 'PLACE', at: now }],
      }),
    );
  }

  static reconstitute(props: OrderProps, base: AggregateBaseProps): Order {
    return new Order({ ...props, items: [...props.items], history: [...props.history] }, base);
  }

  // ------------------------------------------------------------------ accessors

  get customerId(): string {
    return this.props.customerId;
  }

  get customerEmail(): string {
    return this.props.customerEmail;
  }

  get items(): readonly OrderItem[] {
    return this.props.items;
  }

  get totals(): OrderTotals {
    return this.props.totals;
  }

  get status(): OrderStatusValue {
    return this.props.status.value;
  }

  get couponCode(): string | null {
    return this.props.couponCode;
  }

  get paymentId(): string | null {
    return this.props.paymentId;
  }

  get trackingCode(): string | null {
    return this.props.trackingCode;
  }

  get cancellationReason(): string | null {
    return this.props.cancellationReason;
  }

  get inventoryState(): InventoryState {
    return this.props.inventoryState;
  }

  get idempotencyKey(): string | null {
    return this.props.idempotencyKey;
  }

  get history(): readonly StatusChange[] {
    return this.props.history;
  }

  get stockLines(): Array<{ productId: string; quantity: number }> {
    return this.props.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  }

  get allowedEvents(): OrderEvent[] {
    return OrderStateMachine.allowedEvents(this.status);
  }

  isOwnedBy(customerId: string): boolean {
    return this.props.customerId === customerId;
  }

  // ------------------------------------------------------------------ lifecycle

  confirm(): Result<void> {
    const moved = this.apply(OrderEvent.Confirm);
    if (!moved.ok) return moved;

    this.addDomainEvent(
      new OrderPlacedEvent(this.id, {
        ...this.eventBase(),
        totalInCents: this.props.totals.total.amountInCents,
        currency: this.props.totals.total.currency,
        itemCount: this.props.items.reduce((sum, item) => sum + item.quantity, 0),
      }),
    );
    return okVoid();
  }

  requestPayment(paymentId: string): Result<void> {
    const moved = this.apply(OrderEvent.RequestPayment);
    if (!moved.ok) return moved;
    this.props.paymentId = paymentId;
    return okVoid();
  }

  approvePayment(): Result<void> {
    if (!this.props.paymentId) {
      return err(DomainError.invalidState('Cannot approve payment of an order without a payment'));
    }
    const moved = this.apply(OrderEvent.ApprovePayment);
    if (!moved.ok) return moved;

    this.addDomainEvent(
      new OrderPaidEvent(this.id, {
        ...this.eventBase(),
        paymentId: this.props.paymentId,
        totalInCents: this.props.totals.total.amountInCents,
        currency: this.props.totals.total.currency,
      }),
    );
    return okVoid();
  }

  rejectPayment(reason: string): Result<void> {
    const previous = this.status;
    const moved = this.apply(OrderEvent.RejectPayment, reason);
    if (!moved.ok) return moved;
    this.props.cancellationReason = reason;
    this.addDomainEvent(
      new OrderCancelledEvent(this.id, { ...this.eventBase(), reason, previousStatus: previous }),
    );
    return okVoid();
  }

  ship(trackingCode: string): Result<void> {
    const code = trackingCode.trim().toUpperCase();
    if (!TRACKING_CODE.test(code)) {
      return err(DomainError.validation('Tracking code must follow the format AA123456789BR'));
    }
    const moved = this.apply(OrderEvent.Ship);
    if (!moved.ok) return moved;

    this.props.trackingCode = code;
    this.addDomainEvent(
      new OrderShippedEvent(this.id, { ...this.eventBase(), trackingCode: code }),
    );
    return okVoid();
  }

  deliver(): Result<void> {
    const moved = this.apply(OrderEvent.Deliver);
    if (!moved.ok) return moved;
    this.addDomainEvent(new OrderDeliveredEvent(this.id, this.eventBase()));
    return okVoid();
  }

  cancel(reason: string): Result<void> {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      return err(DomainError.validation('A cancellation reason is required'));
    }
    const previous = this.status;
    const moved = this.apply(OrderEvent.Cancel, trimmed);
    if (!moved.ok) return moved;

    this.props.cancellationReason = trimmed;
    this.addDomainEvent(
      new OrderCancelledEvent(this.id, {
        ...this.eventBase(),
        reason: trimmed,
        previousStatus: previous,
      }),
    );
    return okVoid();
  }

  /** Whether cancelling now requires the money to be returned. */
  get requiresRefundOnCancel(): boolean {
    return this.status === OrderStatusValue.Paid;
  }

  // ------------------------------------------------------------------ inventory bookkeeping

  markInventory(state: InventoryState): void {
    this.props.inventoryState = state;
    this.touch();
  }

  // ------------------------------------------------------------------ internals

  private apply(event: OrderEvent, reason?: string): Result<void> {
    const next = OrderStateMachine.transition(this.status, event);
    if (!next.ok) return next;

    this.props.history.push({ from: this.status, to: next.value, event, reason, at: new Date() });
    this.props.status = OrderStatus.of(next.value);
    this.touch();
    return okVoid();
  }

  private eventBase() {
    return { customerId: this.props.customerId, customerEmail: this.props.customerEmail };
  }
}

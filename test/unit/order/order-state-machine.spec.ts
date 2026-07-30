import { Order } from '../../../src/modules/order/domain/entities/order.entity';
import {
  OrderCancelledEvent,
  OrderPaidEvent,
  OrderPlacedEvent,
} from '../../../src/modules/order/domain/events/order.events';
import {
  OrderEvent,
  OrderStateMachine,
} from '../../../src/modules/order/domain/services/order-state-machine';
import { OrderStatusValue as S } from '../../../src/modules/order/domain/value-objects/order-status.vo';

function placeOrder(): Order {
  const placed = Order.place({
    customerId: 'c-1',
    customerEmail: 'ana@example.com',
    currency: 'BRL',
    couponCode: null,
    items: [{ productId: 'p-1', sku: 'SKU-1', name: 'Item', unitPriceInCents: 5_000, quantity: 2 }],
    subtotalInCents: 10_000,
    discountInCents: 0,
    shippingInCents: 1_990,
    totalInCents: 11_990,
  });
  if (!placed.ok) throw new Error(placed.error.message);
  return placed.value;
}

describe('OrderStateMachine', () => {
  it('describes the full happy path', () => {
    const path: Array<[S, OrderEvent, S]> = [
      [S.Draft, OrderEvent.Confirm, S.Confirmed],
      [S.Confirmed, OrderEvent.RequestPayment, S.PaymentPending],
      [S.PaymentPending, OrderEvent.ApprovePayment, S.Paid],
      [S.Paid, OrderEvent.Ship, S.Shipped],
      [S.Shipped, OrderEvent.Deliver, S.Delivered],
    ];
    for (const [from, event, to] of path) {
      expect(OrderStateMachine.transition(from, event)).toEqual({ ok: true, value: to });
    }
  });

  it.each([S.Shipped, S.Delivered, S.Cancelled])('cannot cancel a %s order', (status) => {
    const result = OrderStateMachine.transition(status, OrderEvent.Cancel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE');
  });

  it('has no way out of terminal states', () => {
    expect(OrderStateMachine.isTerminal(S.Delivered)).toBe(true);
    expect(OrderStateMachine.isTerminal(S.Cancelled)).toBe(true);
    expect(OrderStateMachine.isTerminal(S.Paid)).toBe(false);
  });

  it('every status is reachable from DRAFT', () => {
    const reachable = new Set<S>([S.Draft]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const { from, to } of OrderStateMachine.describe()) {
        if (reachable.has(from) && !reachable.has(to)) {
          reachable.add(to);
          grew = true;
        }
      }
    }
    expect(reachable).toEqual(new Set(Object.values(S)));
  });
});

describe('Order aggregate lifecycle', () => {
  it('rejects totals that disagree with the lines', () => {
    const placed = Order.place({
      customerId: 'c',
      customerEmail: 'a@b.co',
      currency: 'BRL',
      couponCode: null,
      items: [{ productId: 'p', sku: 'S', name: 'n', unitPriceInCents: 1_000, quantity: 1 }],
      subtotalInCents: 1_000,
      discountInCents: 0,
      shippingInCents: 0,
      totalInCents: 999,
    });
    expect(placed.ok).toBe(false);
  });

  it('records history and raises events along the way', () => {
    const order = placeOrder();
    expect(order.confirm().ok).toBe(true);
    expect(order.requestPayment('pay-1').ok).toBe(true);
    expect(order.approvePayment().ok).toBe(true);

    const events = order.pullDomainEvents();
    expect(events.map((event) => event.constructor)).toEqual([OrderPlacedEvent, OrderPaidEvent]);
    expect(order.history.map((change) => change.to)).toEqual([
      S.Draft,
      S.Confirmed,
      S.PaymentPending,
      S.Paid,
    ]);
  });

  it('flags refunds when cancelling a paid order', () => {
    const order = placeOrder();
    order.confirm();
    order.requestPayment('pay-1');
    order.approvePayment();
    expect(order.requiresRefundOnCancel).toBe(true);

    expect(order.cancel('Customer changed their mind').ok).toBe(true);
    const cancelled = order
      .pullDomainEvents()
      .find((event) => event instanceof OrderCancelledEvent);
    expect(cancelled?.payload).toMatchObject({ previousStatus: S.Paid });
  });

  it('validates tracking codes on shipment', () => {
    const order = placeOrder();
    order.confirm();
    order.requestPayment('pay-1');
    order.approvePayment();
    expect(order.ship('123').ok).toBe(false);
    expect(order.ship('br123456789br').ok).toBe(true);
    expect(order.trackingCode).toBe('BR123456789BR');
  });

  it('cannot skip payment', () => {
    const order = placeOrder();
    order.confirm();
    expect(order.ship('BR123456789BR').ok).toBe(false);
  });
});

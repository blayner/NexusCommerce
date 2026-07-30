import { EventBus } from '../../../src/shared/application/event-bus';
import { DomainError, err, ok, okVoid, Result } from '../../../src/shared/domain';
import {
  PlaceOrderCommand,
  PlaceOrderHandler,
} from '../../../src/modules/order/application/commands/place-order.command';
import {
  CancelOrderCommand,
  CancelOrderHandler,
} from '../../../src/modules/order/application/commands/cancel-order.command';
import { OrderPlacementSaga } from '../../../src/modules/order/application/sagas/order.saga';
import {
  CheckoutContent,
  CheckoutSourcePort,
} from '../../../src/modules/order/domain/ports/checkout-source.port';
import {
  InventoryLine,
  InventoryPort,
} from '../../../src/modules/order/domain/ports/inventory.port';
import {
  ChargeOutcome,
  ChargeRequest,
  PaymentGatewayPort,
} from '../../../src/modules/order/domain/ports/payment-gateway.port';
import { OrderStatusValue } from '../../../src/modules/order/domain/value-objects/order-status.vo';
import { InMemoryOrderRepository } from '../../../src/modules/order/infrastructure/adapters/in-memory-order.repository';

class FakeInventory implements InventoryPort {
  readonly calls: string[] = [];
  failReserve = false;

  async reserve(_lines: readonly InventoryLine[]): Promise<Result<void>> {
    this.calls.push('reserve');
    return this.failReserve ? err(DomainError.businessRule('Insufficient stock')) : okVoid();
  }
  async release(): Promise<Result<void>> {
    this.calls.push('release');
    return okVoid();
  }
  async commit(): Promise<Result<void>> {
    this.calls.push('commit');
    return okVoid();
  }
  async restock(): Promise<Result<void>> {
    this.calls.push('restock');
    return okVoid();
  }
}

class FakeGateway implements PaymentGatewayPort {
  outcome: ChargeOutcome = { status: 'APPROVED', paymentId: 'pay-1' };
  readonly charges: ChargeRequest[] = [];
  readonly refunds: string[] = [];

  async charge(request: ChargeRequest): Promise<Result<ChargeOutcome>> {
    this.charges.push(request);
    return ok(this.outcome);
  }
  async refund(paymentId: string): Promise<Result<void>> {
    this.refunds.push(paymentId);
    return okVoid();
  }
}

class FakeCheckout implements CheckoutSourcePort {
  completed: string[] = [];
  content: CheckoutContent = {
    currency: 'BRL',
    couponCode: null,
    items: [
      { productId: 'p-1', sku: 'SKU-1', name: 'Item', unitPriceInCents: 15_000, quantity: 2 },
    ],
    subtotalInCents: 30_000,
    discountInCents: 0,
    shippingInCents: 0,
    totalInCents: 30_000,
  };

  async load(): Promise<Result<CheckoutContent>> {
    return ok(this.content);
  }
  async complete(customerId: string): Promise<void> {
    this.completed.push(customerId);
  }
}

describe('Checkout saga (PlaceOrderHandler + OrderPlacementSaga)', () => {
  let orders: InMemoryOrderRepository;
  let inventory: FakeInventory;
  let gateway: FakeGateway;
  let checkout: FakeCheckout;
  let handler: PlaceOrderHandler;
  let eventBus: EventBus;

  const card = { type: 'CREDIT_CARD' as const, cardToken: 'tok_visa_4242', installments: 1 };

  beforeEach(() => {
    orders = new InMemoryOrderRepository();
    inventory = new FakeInventory();
    gateway = new FakeGateway();
    checkout = new FakeCheckout();
    eventBus = new EventBus();
    handler = new PlaceOrderHandler(
      orders,
      checkout,
      new OrderPlacementSaga(inventory, gateway),
      eventBus,
    );
  });

  it('card approved: reserves, charges, commits stock and marks the order PAID', async () => {
    const result = await handler.execute(new PlaceOrderCommand('c-1', 'ana@example.com', card));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.order.status).toBe(OrderStatusValue.Paid);
    expect(result.value.order.inventoryState).toBe('COMMITTED');
    expect(inventory.calls).toEqual(['reserve', 'commit']);
    expect(gateway.charges[0]).toMatchObject({
      amountInCents: 30_000,
      idempotencyKey: `order:${result.value.order.id}`,
    });
    expect(checkout.completed).toEqual(['c-1']);

    const stored = await orders.findById(result.value.order.id);
    expect(stored?.status).toBe(OrderStatusValue.Paid);
  });

  it('PIX: keeps the reservation and waits in PAYMENT_PENDING', async () => {
    gateway.outcome = {
      status: 'PENDING',
      paymentId: 'pay-2',
      instructions: { copyAndPaste: '000201...' },
      expiresAt: null,
    };
    const result = await handler.execute(
      new PlaceOrderCommand('c-1', 'ana@example.com', { type: 'PIX' }),
    );

    expect(result.ok && result.value.order.status).toBe(OrderStatusValue.PaymentPending);
    expect(result.ok && result.value.order.inventoryState).toBe('RESERVED');
    expect(inventory.calls).toEqual(['reserve']);
  });

  it('card declined: releases the reservation and cancels the order', async () => {
    gateway.outcome = { status: 'DECLINED', paymentId: 'pay-3', reason: 'Insufficient funds' };
    const result = await handler.execute(new PlaceOrderCommand('c-1', 'ana@example.com', card));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Insufficient funds');
    const orderId = result.error.details?.orderId as string;
    const stored = await orders.findById(orderId);
    expect(stored?.status).toBe(OrderStatusValue.Cancelled);
    expect(stored?.inventoryState).toBe('RELEASED');
    expect(inventory.calls).toEqual(['reserve', 'release']);
    expect(checkout.completed).toEqual([]); // cart kept so the customer can retry
  });

  it('out of stock: never charges the customer', async () => {
    inventory.failReserve = true;
    const result = await handler.execute(new PlaceOrderCommand('c-1', 'ana@example.com', card));

    expect(result.ok).toBe(false);
    expect(gateway.charges).toHaveLength(0);
  });

  it('is idempotent per Idempotency-Key', async () => {
    const first = await handler.execute(
      new PlaceOrderCommand('c-1', 'ana@example.com', card, 'checkout-key-123'),
    );
    const second = await handler.execute(
      new PlaceOrderCommand('c-1', 'ana@example.com', card, 'checkout-key-123'),
    );

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.order.id).toBe(first.value.order.id);
    expect(gateway.charges).toHaveLength(1);
  });

  it('cancelling a paid order refunds and restocks', async () => {
    const placed = await handler.execute(new PlaceOrderCommand('c-1', 'ana@example.com', card));
    if (!placed.ok) throw new Error('setup failed');

    const cancel = new CancelOrderHandler(orders, inventory, gateway, eventBus);
    const result = await cancel.execute(
      new CancelOrderCommand(
        placed.value.order.id,
        { userId: 'c-1', isAdmin: false },
        'Changed my mind',
      ),
    );

    expect(result.ok && result.value.status).toBe(OrderStatusValue.Cancelled);
    expect(gateway.refunds).toEqual(['pay-1']);
    expect(inventory.calls).toContain('restock');
  });

  it("customers cannot cancel someone else's order", async () => {
    const placed = await handler.execute(new PlaceOrderCommand('c-1', 'ana@example.com', card));
    if (!placed.ok) throw new Error('setup failed');

    const cancel = new CancelOrderHandler(orders, inventory, gateway, eventBus);
    const result = await cancel.execute(
      new CancelOrderCommand(placed.value.order.id, { userId: 'intruder', isAdmin: false }, 'Nope'),
    );
    expect(!result.ok && result.error.code).toBe('FORBIDDEN');
  });
});

import { Money } from '../../../src/shared/domain';
import { Cart, MAX_DISTINCT_ITEMS } from '../../../src/modules/cart/domain/entities/cart.entity';

const TTL = 3600;

function product(
  overrides: Partial<{
    productId: string;
    availableStock: number;
    price: number;
    active: boolean;
  }> = {},
) {
  return {
    productId: overrides.productId ?? 'p-1',
    sku: 'SKU-1',
    name: 'Headphones',
    unitPrice: Money.of(overrides.price ?? 20_000),
    availableStock: overrides.availableStock ?? 10,
    active: overrides.active ?? true,
  };
}

describe('Cart aggregate', () => {
  let cart: Cart;

  beforeEach(() => {
    cart = Cart.createFor('customer-1', TTL, new Date('2026-06-01T12:00:00Z'));
  });

  it('merges quantities of the same product and refreshes the price', () => {
    cart.addItem(product(), 1);
    cart.addItem(product({ price: 18_000 }), 2);

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity.value).toBe(3);
    expect(cart.lines[0].unitPrice.amountInCents).toBe(18_000);
    expect(cart.totalUnits).toBe(3);
  });

  it('never exceeds available stock (including what is already in the cart)', () => {
    expect(cart.addItem(product({ availableStock: 3 }), 2).ok).toBe(true);
    const second = cart.addItem(product({ availableStock: 3 }), 2);
    expect(second.ok).toBe(false);
    expect(cart.lines[0].quantity.value).toBe(2);
  });

  it('rejects inactive products and invalid quantities', () => {
    expect(cart.addItem(product({ active: false }), 1).ok).toBe(false);
    expect(cart.addItem(product(), 0).ok).toBe(false);
    expect(cart.addItem(product({ availableStock: 500 }), 100).ok).toBe(false);
  });

  it('limits the number of distinct products', () => {
    for (let i = 0; i < MAX_DISTINCT_ITEMS; i++) {
      expect(cart.addItem(product({ productId: `p-${i}` }), 1).ok).toBe(true);
    }
    expect(cart.addItem(product({ productId: 'one-too-many' }), 1).ok).toBe(false);
  });

  it('removes a line when quantity is set to zero', () => {
    cart.addItem(product(), 2);
    expect(cart.updateItemQuantity('p-1', 0, 10).ok).toBe(true);
    expect(cart.isEmpty).toBe(true);
  });

  it('expires after the TTL and slides on interaction', () => {
    expect(cart.isExpired(new Date('2026-06-01T12:59:59Z'))).toBe(false);
    expect(cart.isExpired(new Date('2026-06-01T13:00:00Z'))).toBe(true);

    cart.extendExpiry(TTL, new Date('2026-06-01T12:30:00Z'));
    expect(cart.isExpired(new Date('2026-06-01T13:00:00Z'))).toBe(false);
  });

  it('round-trips through its snapshot', () => {
    cart.addItem(product(), 2);
    cart.applyCoupon(' bemvindo10 ');

    const restored = Cart.fromSnapshot(JSON.parse(JSON.stringify(cart.toSnapshot())));
    expect(restored.couponCode).toBe('BEMVINDO10');
    expect(restored.lines[0].lineTotal.amountInCents).toBe(40_000);
    expect(restored.expiresAt.getTime()).toBe(cart.expiresAt.getTime());
  });
});

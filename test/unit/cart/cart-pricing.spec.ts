import { Money } from '../../../src/shared/domain';
import { Cart } from '../../../src/modules/cart/domain/entities/cart.entity';
import { CartPricingService } from '../../../src/modules/cart/domain/services/cart-pricing.domain-service';
import { StaticCouponCatalog } from '../../../src/modules/cart/infrastructure/adapters/static-coupon.catalog';

function cartWith(priceInCents: number, quantity = 1, coupon?: string): Cart {
  const cart = Cart.createFor('c-1', 3600);
  cart.addItem(
    {
      productId: 'p',
      sku: 'SKU',
      name: 'Item',
      unitPrice: Money.of(priceInCents),
      availableStock: 99,
      active: true,
    },
    quantity,
  );
  if (coupon) cart.applyCoupon(coupon);
  return cart;
}

describe('CartPricingService', () => {
  const pricing = new CartPricingService(
    new StaticCouponCatalog([
      { code: 'TEN', kind: 'PERCENTAGE', value: 10 },
      { code: 'HUGE', kind: 'PERCENTAGE', value: 90 },
      { code: 'FIFTY', kind: 'FIXED_AMOUNT', value: 5_000, minSubtotalInCents: 30_000 },
      { code: 'SHIP', kind: 'FREE_SHIPPING', value: 0 },
      { code: 'OLD', kind: 'PERCENTAGE', value: 10, validUntil: new Date('2020-01-01') },
    ]),
  );

  it('charges flat shipping below the free-shipping threshold', () => {
    const result = pricing.calculate(cartWith(10_000));
    expect(result.shipping.amountInCents).toBe(1_990);
    expect(result.total.amountInCents).toBe(11_990);
  });

  it('ships for free from R$ 299,00 (after discounts)', () => {
    expect(pricing.calculate(cartWith(29_900)).shipping.isZero).toBe(true);
    // 30.000 - 10% = 27.000 -> back under the threshold
    expect(pricing.calculate(cartWith(30_000, 1, 'TEN')).shipping.amountInCents).toBe(1_990);
  });

  it('applies percentage coupons capped at 50%', () => {
    const result = pricing.calculate(cartWith(40_000, 1, 'HUGE'));
    expect(result.discount.amountInCents).toBe(20_000);
    expect(result.appliedCoupon).toBe('HUGE');
  });

  it('enforces the minimum subtotal of fixed-amount coupons', () => {
    const below = pricing.calculate(cartWith(20_000, 1, 'FIFTY'));
    expect(below.discount.isZero).toBe(true);
    expect(below.couponRejection).toContain('minimum subtotal');

    const above = pricing.calculate(cartWith(35_000, 1, 'FIFTY'));
    expect(above.discount.amountInCents).toBe(5_000);
  });

  it('reports unknown and expired coupons without failing', () => {
    expect(pricing.calculate(cartWith(10_000, 1, 'NOPE')).couponRejection).toContain(
      'does not exist',
    );
    expect(pricing.calculate(cartWith(10_000, 1, 'OLD')).couponRejection).toContain('expired');
  });

  it('free-shipping coupons zero the shipping only', () => {
    const result = pricing.calculate(cartWith(5_000, 1, 'SHIP'));
    expect(result.shipping.isZero).toBe(true);
    expect(result.discount.isZero).toBe(true);
    expect(result.total.amountInCents).toBe(5_000);
  });

  it('prices an empty cart at zero', () => {
    const result = pricing.calculate(Cart.createFor('c-2', 3600));
    expect(result.total.isZero).toBe(true);
  });
});

import { Currency, Money } from '../../../../shared/domain';
import { Coupon, CouponCatalog } from '../coupons/coupon';
import { Cart } from '../entities/cart.entity';

export interface PricingPolicy {
  /** Orders at or above this (after discounts) ship for free. */
  freeShippingThresholdInCents: number;
  flatShippingInCents: number;
  /** Hard cap protecting margins against stacked/misconfigured percentage coupons. */
  maxDiscountPercentage: number;
}

export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  freeShippingThresholdInCents: 29_900,
  flatShippingInCents: 1_990,
  maxDiscountPercentage: 50,
};

export interface CartPricing {
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
  appliedCoupon: string | null;
  couponRejection: string | null;
}

/**
 * Stateless domain service: pricing depends on the cart *and* external policy/coupons,
 * so it doesn't belong inside the Cart aggregate itself.
 */
export class CartPricingService {
  constructor(
    private readonly coupons: CouponCatalog,
    private readonly policy: PricingPolicy = DEFAULT_PRICING_POLICY,
  ) {}

  calculate(cart: Cart, now: Date = new Date()): CartPricing {
    const currency: Currency = cart.currency ?? 'BRL';
    const subtotal = Money.sum(
      cart.lines.map((line) => line.lineTotal),
      currency,
    );

    const evaluation = this.evaluateCoupon(cart.couponCode, subtotal, now);
    const discount = this.discountFor(evaluation.coupon, subtotal);
    const discounted = subtotal.subtract(discount);

    const freeShipping =
      cart.isEmpty ||
      evaluation.coupon?.kind === 'FREE_SHIPPING' ||
      discounted.amountInCents >= this.policy.freeShippingThresholdInCents;
    const shipping = freeShipping
      ? Money.zero(currency)
      : Money.of(this.policy.flatShippingInCents, currency);

    return {
      subtotal,
      discount,
      shipping,
      total: discounted.add(shipping),
      appliedCoupon: evaluation.coupon?.code ?? null,
      couponRejection: evaluation.rejection,
    };
  }

  private evaluateCoupon(
    code: string | null,
    subtotal: Money,
    now: Date,
  ): { coupon: Coupon | null; rejection: string | null } {
    if (!code) return { coupon: null, rejection: null };

    const coupon = this.coupons.findByCode(code);
    if (!coupon) return { coupon: null, rejection: `Coupon ${code} does not exist` };
    if (coupon.validUntil && coupon.validUntil.getTime() < now.getTime()) {
      return { coupon: null, rejection: `Coupon ${code} has expired` };
    }
    if (coupon.minSubtotalInCents && subtotal.amountInCents < coupon.minSubtotalInCents) {
      const minimum = Money.of(coupon.minSubtotalInCents, subtotal.currency).format();
      return {
        coupon: null,
        rejection: `Coupon ${code} requires a minimum subtotal of ${minimum}`,
      };
    }
    return { coupon, rejection: null };
  }

  private discountFor(coupon: Coupon | null, subtotal: Money): Money {
    if (!coupon) return Money.zero(subtotal.currency);

    const cap = subtotal.percentage(this.policy.maxDiscountPercentage);
    switch (coupon.kind) {
      case 'PERCENTAGE':
        return subtotal.percentage(Math.min(coupon.value, 100)).min(cap);
      case 'FIXED_AMOUNT':
        return Money.of(coupon.value, subtotal.currency).min(subtotal).min(cap);
      case 'FREE_SHIPPING':
        return Money.zero(subtotal.currency);
    }
  }
}

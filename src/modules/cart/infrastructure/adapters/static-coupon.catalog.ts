import { Coupon, CouponCatalog } from '../../domain/coupons/coupon';

const DEFAULT_COUPONS: Coupon[] = [
  { code: 'BEMVINDO10', kind: 'PERCENTAGE', value: 10 },
  { code: 'FRETEGRATIS', kind: 'FREE_SHIPPING', value: 0, minSubtotalInCents: 9_900 },
  { code: 'DESCONTO50', kind: 'FIXED_AMOUNT', value: 5_000, minSubtotalInCents: 30_000 },
];

/**
 * Configuration-backed coupon source. Swapping it for a promotions service only
 * requires another `CouponCatalog` adapter.
 */
export class StaticCouponCatalog implements CouponCatalog {
  private readonly coupons: Map<string, Coupon>;

  constructor(coupons: Coupon[] = DEFAULT_COUPONS) {
    this.coupons = new Map(coupons.map((coupon) => [coupon.code.toUpperCase(), coupon]));
  }

  findByCode(code: string): Coupon | undefined {
    return this.coupons.get(code.trim().toUpperCase());
  }
}

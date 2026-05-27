export type CouponKind = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';

export interface Coupon {
  code: string;
  kind: CouponKind;
  /** PERCENTAGE: 1..100, FIXED_AMOUNT: cents, FREE_SHIPPING: ignored. */
  value: number;
  minSubtotalInCents?: number;
  validUntil?: Date;
}

export const COUPON_CATALOG = Symbol('COUPON_CATALOG');

/** Driven port: where coupon definitions come from (static list, promotions service...). */
export interface CouponCatalog {
  findByCode(code: string): Coupon | undefined;
}

import { Currency, Result } from '../../../../shared/domain';

export const CHECKOUT_SOURCE_PORT = Symbol('CHECKOUT_SOURCE_PORT');

export interface CheckoutContent {
  currency: Currency;
  couponCode: string | null;
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

/** Where the items of a new order come from (today: the customer's cart). */
export interface CheckoutSourcePort {
  load(customerId: string): Promise<Result<CheckoutContent>>;
  complete(customerId: string): Promise<void>;
}

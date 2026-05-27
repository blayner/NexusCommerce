import { Cart } from '../../domain/entities/cart.entity';
import { CartPricing } from '../../domain/services/cart-pricing.domain-service';

export interface CartView {
  customerId: string;
  currency: string;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unitPriceInCents: number;
    quantity: number;
    lineTotalInCents: number;
  }>;
  totalUnits: number;
  couponCode: string | null;
  couponRejection: string | null;
  subtotalInCents: number;
  discountInCents: number;
  shippingInCents: number;
  totalInCents: number;
  expiresAt: string;
}

export function toCartView(cart: Cart, pricing: CartPricing): CartView {
  return {
    customerId: cart.customerId,
    currency: pricing.total.currency,
    items: cart.lines.map((line) => ({
      productId: line.productId,
      sku: line.sku,
      name: line.name,
      unitPriceInCents: line.unitPrice.amountInCents,
      quantity: line.quantity.value,
      lineTotalInCents: line.lineTotal.amountInCents,
    })),
    totalUnits: cart.totalUnits,
    couponCode: cart.couponCode,
    couponRejection: pricing.couponRejection,
    subtotalInCents: pricing.subtotal.amountInCents,
    discountInCents: pricing.discount.amountInCents,
    shippingInCents: pricing.shipping.amountInCents,
    totalInCents: pricing.total.amountInCents,
    expiresAt: cart.expiresAt.toISOString(),
  };
}

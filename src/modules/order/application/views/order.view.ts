import { Order } from '../../domain/entities/order.entity';

export interface OrderView {
  id: string;
  customerId: string;
  status: string;
  allowedActions: string[];
  currency: string;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unitPriceInCents: number;
    quantity: number;
    lineTotalInCents: number;
  }>;
  subtotalInCents: number;
  discountInCents: number;
  shippingInCents: number;
  totalInCents: number;
  couponCode: string | null;
  paymentId: string | null;
  trackingCode: string | null;
  cancellationReason: string | null;
  history: Array<{ from: string | null; to: string; event: string; reason?: string; at: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceOrderView extends OrderView {
  payment: {
    status: string;
    instructions: Record<string, string> | null;
    expiresAt: string | null;
  } | null;
}

export function toOrderView(order: Order): OrderView {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    allowedActions: order.allowedEvents,
    currency: order.totals.total.currency,
    items: order.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      unitPriceInCents: item.unitPrice.amountInCents,
      quantity: item.quantity,
      lineTotalInCents: item.lineTotal.amountInCents,
    })),
    subtotalInCents: order.totals.subtotal.amountInCents,
    discountInCents: order.totals.discount.amountInCents,
    shippingInCents: order.totals.shipping.amountInCents,
    totalInCents: order.totals.total.amountInCents,
    couponCode: order.couponCode,
    paymentId: order.paymentId,
    trackingCode: order.trackingCode,
    cancellationReason: order.cancellationReason,
    history: order.history.map((change) => ({
      from: change.from,
      to: change.to,
      event: change.event,
      reason: change.reason,
      at: change.at.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

import { DomainError, DomainException, isCurrency, Money, unwrap } from '../../../../shared/domain';
import { InventoryState, Order, StatusChange } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderStatus } from '../../domain/value-objects/order-status.vo';

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string;
  sku: string;
  name: string;
  unitPriceInCents: number;
  quantity: number;
}

export interface OrderRecord {
  id: string;
  customerId: string;
  customerEmail: string;
  status: string;
  currency: string;
  subtotalInCents: number;
  discountInCents: number;
  shippingInCents: number;
  totalInCents: number;
  couponCode: string | null;
  paymentId: string | null;
  trackingCode: string | null;
  cancellationReason: string | null;
  inventoryState: string;
  idempotencyKey: string | null;
  history: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

type SerializedChange = Omit<StatusChange, 'at'> & { at: string };

const INVENTORY_STATES = new Set<string>([
  'NONE',
  'RESERVED',
  'COMMITTED',
  'RELEASED',
  'RESTOCKED',
]);

export const OrderMapper = {
  toDomain(record: OrderRecord, items: OrderItemRecord[]): Order {
    const currency = record.currency;
    if (!isCurrency(currency) || !INVENTORY_STATES.has(record.inventoryState)) {
      throw new DomainException(DomainError.invalidState(`Corrupted order record ${record.id}`));
    }
    const history = (
      Array.isArray(record.history) ? (record.history as SerializedChange[]) : []
    ).map((change) => ({ ...change, at: new Date(change.at) }));

    return Order.reconstitute(
      {
        customerId: record.customerId,
        customerEmail: record.customerEmail,
        items: items.map((item) =>
          OrderItem.reconstitute(
            {
              productId: item.productId,
              sku: item.sku,
              name: item.name,
              unitPrice: Money.of(item.unitPriceInCents, currency),
              quantity: item.quantity,
            },
            item.id,
          ),
        ),
        totals: {
          subtotal: Money.of(record.subtotalInCents, currency),
          discount: Money.of(record.discountInCents, currency),
          shipping: Money.of(record.shippingInCents, currency),
          total: Money.of(record.totalInCents, currency),
        },
        status: unwrap(OrderStatus.parse(record.status)),
        couponCode: record.couponCode,
        paymentId: record.paymentId,
        trackingCode: record.trackingCode,
        cancellationReason: record.cancellationReason,
        inventoryState: record.inventoryState as InventoryState,
        idempotencyKey: record.idempotencyKey,
        history,
      },
      {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        version: record.version,
      },
    );
  },

  toRecord(order: Order): OrderRecord {
    return {
      id: order.id,
      customerId: order.customerId,
      customerEmail: order.customerEmail,
      status: order.status,
      currency: order.totals.total.currency,
      subtotalInCents: order.totals.subtotal.amountInCents,
      discountInCents: order.totals.discount.amountInCents,
      shippingInCents: order.totals.shipping.amountInCents,
      totalInCents: order.totals.total.amountInCents,
      couponCode: order.couponCode,
      paymentId: order.paymentId,
      trackingCode: order.trackingCode,
      cancellationReason: order.cancellationReason,
      inventoryState: order.inventoryState,
      idempotencyKey: order.idempotencyKey,
      history: order.history.map((change) => ({ ...change, at: change.at.toISOString() })),
      version: order.version,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  },

  toItemRecords(order: Order): OrderItemRecord[] {
    return order.items.map((item) => ({
      id: item.id,
      orderId: order.id,
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      unitPriceInCents: item.unitPrice.amountInCents,
      quantity: item.quantity,
    }));
  },
};

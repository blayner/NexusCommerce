import {
  AggregateRoot,
  Currency,
  DomainError,
  err,
  Money,
  okVoid,
  Result,
} from '../../../../shared/domain';
import { Quantity } from '../value-objects/quantity.vo';
import { CartItem } from './cart-item.entity';

export const MAX_DISTINCT_ITEMS = 30;

export interface CartProductInput {
  productId: string;
  sku: string;
  name: string;
  unitPrice: Money;
  availableStock: number;
  active: boolean;
}

export interface CartSnapshot {
  id: string;
  customerId: string;
  couponCode: string | null;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unitPriceInCents: number;
    currency: Currency;
    quantity: number;
  }>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * Shopping cart aggregate (one per customer). Short-lived and stored in Redis with a
 * sliding TTL; stock is only *checked* here – it is reserved at checkout by the order saga.
 */
export class Cart extends AggregateRoot {
  private readonly items = new Map<string, CartItem>();

  private constructor(
    private readonly _customerId: string,
    private _couponCode: string | null,
    private _expiresAt: Date,
    base: { id?: string; createdAt?: Date; updatedAt?: Date } = {},
  ) {
    super(base);
  }

  static createFor(customerId: string, ttlSeconds: number, now: Date = new Date()): Cart {
    return new Cart(customerId, null, new Date(now.getTime() + ttlSeconds * 1000));
  }

  static fromSnapshot(snapshot: CartSnapshot): Cart {
    const cart = new Cart(snapshot.customerId, snapshot.couponCode, new Date(snapshot.expiresAt), {
      id: snapshot.id,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    });
    for (const item of snapshot.items) {
      const quantity = Quantity.create(item.quantity);
      if (!quantity.ok) continue; // drop corrupted lines instead of failing the whole cart
      cart.items.set(
        item.productId,
        CartItem.create({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          unitPrice: Money.of(item.unitPriceInCents, item.currency),
          quantity: quantity.value,
        }),
      );
    }
    return cart;
  }

  get customerId(): string {
    return this._customerId;
  }

  get couponCode(): string | null {
    return this._couponCode;
  }

  get expiresAt(): Date {
    return this._expiresAt;
  }

  get lines(): readonly CartItem[] {
    return [...this.items.values()];
  }

  get isEmpty(): boolean {
    return this.items.size === 0;
  }

  get totalUnits(): number {
    return this.lines.reduce((sum, item) => sum + item.quantity.value, 0);
  }

  get currency(): Currency | null {
    return this.lines[0]?.unitPrice.currency ?? null;
  }

  getItem(productId: string): CartItem | undefined {
    return this.items.get(productId);
  }

  addItem(product: CartProductInput, quantity: number): Result<void> {
    if (!product.active) {
      return err(DomainError.businessRule(`Product ${product.sku} is not available for sale`));
    }

    const requested = Quantity.create(quantity);
    if (!requested.ok) return requested;

    if (this.currency && this.currency !== product.unitPrice.currency) {
      return err(DomainError.businessRule('All items in a cart must share the same currency'));
    }

    const existing = this.items.get(product.productId);
    if (!existing && this.items.size >= MAX_DISTINCT_ITEMS) {
      return err(
        DomainError.businessRule(
          `A cart can hold at most ${MAX_DISTINCT_ITEMS} different products`,
        ),
      );
    }

    const total = existing ? existing.quantity.add(requested.value) : requested;
    if (!total.ok) return total;

    if (total.value.value > product.availableStock) {
      return err(
        DomainError.businessRule(
          `Only ${product.availableStock} unit(s) of ${product.sku} available`,
          {
            productId: product.productId,
            requested: total.value.value,
            available: product.availableStock,
          },
        ),
      );
    }

    if (existing) {
      existing.changeQuantity(total.value);
      existing.refreshProductData(product.name, product.unitPrice);
    } else {
      this.items.set(
        product.productId,
        CartItem.create({
          productId: product.productId,
          sku: product.sku,
          name: product.name,
          unitPrice: product.unitPrice,
          quantity: total.value,
        }),
      );
    }
    this.touch();
    return okVoid();
  }

  /** Sets an absolute quantity; 0 removes the line. */
  updateItemQuantity(productId: string, quantity: number, availableStock: number): Result<void> {
    const item = this.items.get(productId);
    if (!item) return err(DomainError.notFound('Cart item', productId));

    if (quantity === 0) {
      this.items.delete(productId);
      this.touch();
      return okVoid();
    }

    const next = Quantity.create(quantity);
    if (!next.ok) return next;
    if (quantity > availableStock) {
      return err(
        DomainError.businessRule(`Only ${availableStock} unit(s) of ${item.sku} available`, {
          productId,
          requested: quantity,
          available: availableStock,
        }),
      );
    }

    item.changeQuantity(next.value);
    this.touch();
    return okVoid();
  }

  removeItem(productId: string): Result<void> {
    if (!this.items.delete(productId)) {
      return err(DomainError.notFound('Cart item', productId));
    }
    this.touch();
    return okVoid();
  }

  applyCoupon(code: string): void {
    this._couponCode = code.trim().toUpperCase();
    this.touch();
  }

  removeCoupon(): void {
    this._couponCode = null;
    this.touch();
  }

  clear(): void {
    this.items.clear();
    this._couponCode = null;
    this.touch();
  }

  isExpired(now: Date = new Date()): boolean {
    return this._expiresAt.getTime() <= now.getTime();
  }

  /** Sliding expiration: each interaction keeps an active cart alive. */
  extendExpiry(ttlSeconds: number, now: Date = new Date()): void {
    this._expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  }

  toSnapshot(): CartSnapshot {
    return {
      id: this.id,
      customerId: this._customerId,
      couponCode: this._couponCode,
      items: this.lines.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        unitPriceInCents: item.unitPrice.amountInCents,
        currency: item.unitPrice.currency,
        quantity: item.quantity.value,
      })),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      expiresAt: this._expiresAt.toISOString(),
    };
  }
}

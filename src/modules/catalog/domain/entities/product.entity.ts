import {
  AggregateBaseProps,
  AggregateRoot,
  Currency,
  DomainError,
  err,
  ok,
  okVoid,
  Result,
} from '../../../../shared/domain';
import {
  ProductCreatedEvent,
  ProductPriceChangedEvent,
  StockDepletedEvent,
  StockReplenishedEvent,
} from '../events/product.events';
import { Price } from '../value-objects/price.vo';
import { Sku } from '../value-objects/sku.vo';

export interface ProductProps {
  name: string;
  description: string;
  sku: Sku;
  price: Price;
  categoryId: string | null;
  /** Physical units in the warehouse. */
  stockOnHand: number;
  /** Units promised to orders that are not paid yet. */
  stockReserved: number;
  active: boolean;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  sku: string;
  priceInCents: number;
  compareAtPriceInCents?: number;
  currency?: Currency;
  categoryId?: string | null;
  initialStock?: number;
}

const MAX_RESERVATION_PER_LINE = 1_000;

/**
 * Product aggregate. Owns the stock invariants:
 *  - 0 <= stockReserved <= stockOnHand
 *  - reservations only for active products
 * Concurrency is protected by the optimistic `version` checked in the repository.
 */
export class Product extends AggregateRoot {
  private constructor(
    private props: ProductProps,
    base?: AggregateBaseProps,
  ) {
    super(base);
  }

  static create(input: CreateProductInput): Result<Product> {
    const name = input.name?.trim() ?? '';
    if (name.length < 3 || name.length > 120) {
      return err(DomainError.validation('Product name must have between 3 and 120 characters'));
    }

    const sku = Sku.create(input.sku);
    if (!sku.ok) return sku;

    const price = Price.create(
      input.priceInCents,
      input.currency ?? 'BRL',
      input.compareAtPriceInCents,
    );
    if (!price.ok) return price;

    const initialStock = input.initialStock ?? 0;
    if (!Number.isInteger(initialStock) || initialStock < 0) {
      return err(DomainError.validation('Initial stock must be a non-negative integer'));
    }

    const product = new Product({
      name,
      description: input.description?.trim() ?? '',
      sku: sku.value,
      price: price.value,
      categoryId: input.categoryId ?? null,
      stockOnHand: initialStock,
      stockReserved: 0,
      active: true,
    });
    product.addDomainEvent(new ProductCreatedEvent(product.id, { sku: sku.value.value, name }));
    return ok(product);
  }

  /** Rebuilds an aggregate from persistence without re-running creation rules/events. */
  static reconstitute(props: ProductProps, base: AggregateBaseProps): Product {
    return new Product({ ...props }, base);
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string {
    return this.props.description;
  }

  get sku(): Sku {
    return this.props.sku;
  }

  get price(): Price {
    return this.props.price;
  }

  get categoryId(): string | null {
    return this.props.categoryId;
  }

  get stockOnHand(): number {
    return this.props.stockOnHand;
  }

  get stockReserved(): number {
    return this.props.stockReserved;
  }

  get availableStock(): number {
    return this.props.stockOnHand - this.props.stockReserved;
  }

  get active(): boolean {
    return this.props.active;
  }

  get isPurchasable(): boolean {
    return this.props.active && this.availableStock > 0;
  }

  changePrice(amountInCents: number, compareAtInCents?: number | null): Result<void> {
    const price = Price.create(amountInCents, this.props.price.currency, compareAtInCents);
    if (!price.ok) return price;

    const previous = this.props.price.amount.amountInCents;
    this.props.price = price.value;
    this.touch();

    if (previous !== amountInCents) {
      this.addDomainEvent(
        new ProductPriceChangedEvent(this.id, {
          sku: this.sku.value,
          previousPriceInCents: previous,
          newPriceInCents: amountInCents,
        }),
      );
    }
    return okVoid();
  }

  /** Holds units for a pending order. All-or-nothing per product. */
  reserve(quantity: number): Result<void> {
    const valid = this.validateQuantity(quantity);
    if (!valid.ok) return valid;

    if (!this.props.active) {
      return err(DomainError.businessRule(`Product ${this.sku.value} is not available for sale`));
    }
    if (quantity > MAX_RESERVATION_PER_LINE) {
      return err(
        DomainError.businessRule(
          `Cannot reserve more than ${MAX_RESERVATION_PER_LINE} units at once`,
        ),
      );
    }
    if (quantity > this.availableStock) {
      return err(
        DomainError.businessRule(`Insufficient stock for ${this.sku.value}`, {
          productId: this.id,
          sku: this.sku.value,
          requested: quantity,
          available: this.availableStock,
        }),
      );
    }

    this.props.stockReserved += quantity;
    this.touch();
    if (this.availableStock === 0) {
      this.addDomainEvent(new StockDepletedEvent(this.id, { sku: this.sku.value }));
    }
    return okVoid();
  }

  /** Returns reserved units to the available pool (order cancelled / payment failed). */
  releaseReservation(quantity: number): Result<void> {
    const valid = this.validateQuantity(quantity);
    if (!valid.ok) return valid;
    if (quantity > this.props.stockReserved) {
      return err(
        DomainError.invalidState(`Cannot release ${quantity} units of ${this.sku.value}`, {
          reserved: this.props.stockReserved,
        }),
      );
    }

    const wasDepleted = this.availableStock === 0;
    this.props.stockReserved -= quantity;
    this.touch();
    this.raiseReplenishedIf(wasDepleted);
    return okVoid();
  }

  /** Converts a reservation into a sale: units leave the warehouse. */
  commitReservation(quantity: number): Result<void> {
    const valid = this.validateQuantity(quantity);
    if (!valid.ok) return valid;
    if (quantity > this.props.stockReserved) {
      return err(
        DomainError.invalidState(`Cannot commit ${quantity} units of ${this.sku.value}`, {
          reserved: this.props.stockReserved,
        }),
      );
    }

    this.props.stockReserved -= quantity;
    this.props.stockOnHand -= quantity;
    this.touch();
    return okVoid();
  }

  restock(quantity: number): Result<void> {
    const valid = this.validateQuantity(quantity);
    if (!valid.ok) return valid;

    const wasDepleted = this.availableStock === 0;
    this.props.stockOnHand += quantity;
    this.touch();
    this.raiseReplenishedIf(wasDepleted);
    return okVoid();
  }

  /** Inventory count correction. Can never go below what is already promised. */
  adjustStockOnHand(newStockOnHand: number): Result<void> {
    if (!Number.isInteger(newStockOnHand) || newStockOnHand < 0) {
      return err(DomainError.validation('Stock must be a non-negative integer'));
    }
    if (newStockOnHand < this.props.stockReserved) {
      return err(
        DomainError.businessRule('Stock on hand cannot be lower than reserved units', {
          reserved: this.props.stockReserved,
        }),
      );
    }

    const wasDepleted = this.availableStock === 0;
    this.props.stockOnHand = newStockOnHand;
    this.touch();
    if (this.availableStock === 0 && !wasDepleted) {
      this.addDomainEvent(new StockDepletedEvent(this.id, { sku: this.sku.value }));
    }
    this.raiseReplenishedIf(wasDepleted);
    return okVoid();
  }

  deactivate(): void {
    this.props.active = false;
    this.touch();
  }

  activate(): void {
    this.props.active = true;
    this.touch();
  }

  private validateQuantity(quantity: number): Result<void> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return err(DomainError.validation('Quantity must be a positive integer', { quantity }));
    }
    return okVoid();
  }

  private raiseReplenishedIf(wasDepleted: boolean): void {
    if (wasDepleted && this.availableStock > 0) {
      this.addDomainEvent(
        new StockReplenishedEvent(this.id, {
          sku: this.sku.value,
          availableStock: this.availableStock,
        }),
      );
    }
  }
}

import { Currency, DomainError, Entity, err, Money, ok, Result } from '../../../../shared/domain';

export interface OrderItemProps {
  productId: string;
  sku: string;
  name: string;
  unitPrice: Money;
  quantity: number;
}

/** Immutable order line: product data is frozen at purchase time. */
export class OrderItem extends Entity {
  private constructor(
    private readonly props: OrderItemProps,
    id?: string,
  ) {
    super({ id });
  }

  static create(input: {
    productId: string;
    sku: string;
    name: string;
    unitPriceInCents: number;
    quantity: number;
    currency: Currency;
  }): Result<OrderItem> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return err(DomainError.validation(`Invalid quantity for ${input.sku}`));
    }
    if (!Number.isInteger(input.unitPriceInCents) || input.unitPriceInCents <= 0) {
      return err(DomainError.validation(`Invalid unit price for ${input.sku}`));
    }
    return ok(
      new OrderItem({
        productId: input.productId,
        sku: input.sku,
        name: input.name,
        unitPrice: Money.of(input.unitPriceInCents, input.currency),
        quantity: input.quantity,
      }),
    );
  }

  static reconstitute(props: OrderItemProps, id: string): OrderItem {
    return new OrderItem(props, id);
  }

  get productId(): string {
    return this.props.productId;
  }

  get sku(): string {
    return this.props.sku;
  }

  get name(): string {
    return this.props.name;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get lineTotal(): Money {
    return this.props.unitPrice.multiply(this.props.quantity);
  }
}

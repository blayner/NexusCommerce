import { Entity, Money } from '../../../../shared/domain';
import { Quantity } from '../value-objects/quantity.vo';

export interface CartItemProps {
  productId: string;
  sku: string;
  name: string;
  unitPrice: Money;
  quantity: Quantity;
}

/**
 * Line of a cart. Identified by product id inside the Cart aggregate; the unit price is a
 * snapshot refreshed whenever the item is touched, and re-validated at checkout.
 */
export class CartItem extends Entity {
  private constructor(private props: CartItemProps) {
    super({ id: props.productId });
  }

  static create(props: CartItemProps): CartItem {
    return new CartItem({ ...props });
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

  get quantity(): Quantity {
    return this.props.quantity;
  }

  get lineTotal(): Money {
    return this.props.unitPrice.multiply(this.props.quantity.value);
  }

  changeQuantity(quantity: Quantity): void {
    this.props.quantity = quantity;
  }

  refreshProductData(name: string, unitPrice: Money): void {
    this.props.name = name;
    this.props.unitPrice = unitPrice;
  }
}

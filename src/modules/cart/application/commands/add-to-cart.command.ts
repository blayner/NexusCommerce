import { Inject, Injectable } from '@nestjs/common';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { Cart } from '../../domain/entities/cart.entity';
import {
  CART_REPOSITORY,
  CartRepositoryPort,
} from '../../domain/repositories/cart.repository.port';
import { CART_SETTINGS, CartSettings } from '../cart-settings';
import { PRODUCT_CATALOG_PORT, ProductCatalogPort } from '../ports/product-catalog.port';

export class AddToCartCommand {
  constructor(
    public readonly customerId: string,
    public readonly productId: string,
    public readonly quantity: number,
  ) {}
}

@Injectable()
export class AddToCartHandler {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepositoryPort,
    @Inject(PRODUCT_CATALOG_PORT) private readonly catalog: ProductCatalogPort,
    @Inject(CART_SETTINGS) private readonly settings: CartSettings,
  ) {}

  async execute(command: AddToCartCommand, now: Date = new Date()): Promise<Result<Cart>> {
    const product = await this.catalog.getProduct(command.productId);
    if (!product) return err(DomainError.notFound('Product', command.productId));

    const existing = await this.carts.findByCustomerId(command.customerId);
    const cart =
      existing && !existing.isExpired(now)
        ? existing
        : Cart.createFor(command.customerId, this.settings.ttlSeconds, now);

    const added = cart.addItem(product, command.quantity);
    if (!added.ok) return added;

    cart.extendExpiry(this.settings.ttlSeconds, now);
    await this.carts.save(cart);
    return ok(cart);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Currency, DomainError, err, ok, Result } from '../../../../shared/domain';
import { Cart } from '../../domain/entities/cart.entity';
import {
  CART_REPOSITORY,
  CartRepositoryPort,
} from '../../domain/repositories/cart.repository.port';
import { CartPricingService } from '../../domain/services/cart-pricing.domain-service';
import { CART_SETTINGS, CartSettings } from '../cart-settings';
import { PRODUCT_CATALOG_PORT, ProductCatalogPort } from '../ports/product-catalog.port';
import { CartView, toCartView } from '../views/cart.view';

/** Priced, re-validated content of a cart, handed to the order module at checkout. */
export interface CheckoutSnapshot {
  customerId: string;
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

@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepositoryPort,
    @Inject(PRODUCT_CATALOG_PORT) private readonly catalog: ProductCatalogPort,
    @Inject(CART_SETTINGS) private readonly settings: CartSettings,
    private readonly pricing: CartPricingService,
  ) {}

  async getCart(customerId: string): Promise<CartView> {
    const cart = await this.loadOrEmpty(customerId);
    return toCartView(cart, this.pricing.calculate(cart));
  }

  async updateQuantity(
    customerId: string,
    productId: string,
    quantity: number,
  ): Promise<Result<CartView>> {
    const cart = await this.carts.findByCustomerId(customerId);
    if (!cart || cart.isExpired()) return err(DomainError.notFound('Cart', customerId));

    const product = await this.catalog.getProduct(productId);
    const updated = cart.updateItemQuantity(productId, quantity, product?.availableStock ?? 0);
    if (!updated.ok) return updated;

    await this.persist(cart);
    return ok(toCartView(cart, this.pricing.calculate(cart)));
  }

  async applyCoupon(customerId: string, code: string): Promise<Result<CartView>> {
    const cart = await this.carts.findByCustomerId(customerId);
    if (!cart || cart.isEmpty)
      return err(DomainError.businessRule('Add items before applying a coupon'));

    cart.applyCoupon(code);
    const pricing = this.pricing.calculate(cart);
    if (pricing.couponRejection) {
      return err(DomainError.businessRule(pricing.couponRejection, { code }));
    }

    await this.persist(cart);
    return ok(toCartView(cart, pricing));
  }

  async removeCoupon(customerId: string): Promise<CartView> {
    const cart = await this.loadOrEmpty(customerId);
    if (cart.couponCode) {
      cart.removeCoupon();
      await this.persist(cart);
    }
    return toCartView(cart, this.pricing.calculate(cart));
  }

  async clear(customerId: string): Promise<void> {
    await this.carts.delete(customerId);
  }

  /**
   * Builds the checkout snapshot. Prices and availability are re-read from the catalog
   * so the order never trusts stale cart data (prices may have changed since adding).
   */
  async getCheckoutSnapshot(customerId: string): Promise<Result<CheckoutSnapshot>> {
    const cart = await this.carts.findByCustomerId(customerId);
    if (!cart || cart.isExpired() || cart.isEmpty) {
      return err(DomainError.businessRule('Cart is empty'));
    }

    const products = await this.catalog.getProducts(cart.lines.map((line) => line.productId));
    const byId = new Map(products.map((product) => [product.productId, product]));

    for (const line of cart.lines) {
      const product = byId.get(line.productId);
      if (!product || !product.active) {
        return err(
          DomainError.businessRule(`Product ${line.sku} is no longer available`, {
            productId: line.productId,
          }),
        );
      }
      if (product.availableStock < line.quantity.value) {
        return err(
          DomainError.businessRule(
            `Only ${product.availableStock} unit(s) of ${line.sku} available`,
            {
              productId: line.productId,
              requested: line.quantity.value,
              available: product.availableStock,
            },
          ),
        );
      }
      line.refreshProductData(product.name, product.unitPrice);
    }

    const pricing = this.pricing.calculate(cart);
    return ok({
      customerId,
      currency: pricing.total.currency,
      couponCode: pricing.appliedCoupon,
      items: cart.lines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        name: line.name,
        unitPriceInCents: line.unitPrice.amountInCents,
        quantity: line.quantity.value,
      })),
      subtotalInCents: pricing.subtotal.amountInCents,
      discountInCents: pricing.discount.amountInCents,
      shippingInCents: pricing.shipping.amountInCents,
      totalInCents: pricing.total.amountInCents,
    });
  }

  private async loadOrEmpty(customerId: string): Promise<Cart> {
    const cart = await this.carts.findByCustomerId(customerId);
    return cart && !cart.isExpired() ? cart : Cart.createFor(customerId, this.settings.ttlSeconds);
  }

  private async persist(cart: Cart): Promise<void> {
    cart.extendExpiry(this.settings.ttlSeconds);
    await this.carts.save(cart);
  }
}

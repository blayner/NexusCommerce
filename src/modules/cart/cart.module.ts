import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../../config/app.config';
import { CatalogModule } from '../catalog';
import { CART_SETTINGS, CartSettings } from './application/cart-settings';
import { AddToCartHandler } from './application/commands/add-to-cart.command';
import { RemoveFromCartHandler } from './application/commands/remove-from-cart.command';
import { PRODUCT_CATALOG_PORT } from './application/ports/product-catalog.port';
import { CartService } from './application/services/cart.service';
import { COUPON_CATALOG, CouponCatalog } from './domain/coupons/coupon';
import { CART_REPOSITORY } from './domain/repositories/cart.repository.port';
import { CartPricingService } from './domain/services/cart-pricing.domain-service';
import { RedisCartRepository } from './infrastructure/adapters/cart.repository.adapter';
import { CatalogProductAdapter } from './infrastructure/adapters/catalog-product.adapter';
import { StaticCouponCatalog } from './infrastructure/adapters/static-coupon.catalog';
import { CartController } from './presentation/cart.controller';

@Module({
  imports: [CatalogModule],
  controllers: [CartController],
  providers: [
    { provide: CART_REPOSITORY, useClass: RedisCartRepository },
    { provide: PRODUCT_CATALOG_PORT, useClass: CatalogProductAdapter },
    { provide: COUPON_CATALOG, useFactory: () => new StaticCouponCatalog() },
    {
      provide: CART_SETTINGS,
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>): CartSettings => ({
        ttlSeconds: config.cart.ttlSeconds,
      }),
    },
    {
      provide: CartPricingService,
      inject: [COUPON_CATALOG],
      useFactory: (coupons: CouponCatalog) => new CartPricingService(coupons),
    },
    AddToCartHandler,
    RemoveFromCartHandler,
    CartService,
  ],
  exports: [CartService],
})
export class CartModule {}

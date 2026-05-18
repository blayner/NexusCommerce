import { Module } from '@nestjs/common';
import { CatalogCache } from './application/catalog-cache';
import { ChangePriceHandler } from './application/commands/change-price.command';
import { CreateCategoryHandler } from './application/commands/create-category.command';
import { CreateProductHandler } from './application/commands/create-product.command';
import { UpdateStockHandler } from './application/commands/update-stock.command';
import { GetProductHandler } from './application/queries/get-product.query';
import { SearchProductsHandler } from './application/queries/search-products.query';
import { CatalogService } from './application/services/catalog.service';
import { CATEGORY_REPOSITORY } from './domain/repositories/category.repository.port';
import { PRODUCT_REPOSITORY } from './domain/repositories/product.repository.port';
import { PrismaCategoryRepository } from './infrastructure/adapters/category.repository.adapter';
import { PrismaProductRepository } from './infrastructure/adapters/product.repository.adapter';
import { CatalogController } from './presentation/catalog.controller';

@Module({
  controllers: [CatalogController],
  providers: [
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    CatalogCache,
    CreateProductHandler,
    UpdateStockHandler,
    ChangePriceHandler,
    CreateCategoryHandler,
    GetProductHandler,
    SearchProductsHandler,
    CatalogService,
  ],
  // Only the facade crosses the module boundary.
  exports: [CatalogService],
})
export class CatalogModule {}

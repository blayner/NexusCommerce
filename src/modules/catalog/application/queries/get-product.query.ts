import { Inject, Injectable } from '@nestjs/common';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from '../../domain/repositories/product.repository.port';
import { CatalogCache, PRODUCT_TTL_SECONDS } from '../catalog-cache';
import { ProductView, toProductView } from '../views/product.view';

export class GetProductQuery {
  constructor(public readonly productId: string) {}
}

@Injectable()
export class GetProductHandler {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    private readonly cache: CatalogCache,
  ) {}

  async execute(query: GetProductQuery): Promise<Result<ProductView>> {
    const view = await this.cache.client.wrap<ProductView | null>(
      this.cache.productKey(query.productId),
      PRODUCT_TTL_SECONDS,
      async () => {
        const product = await this.products.findById(query.productId);
        return product ? toProductView(product) : null;
      },
    );

    return view ? ok(view) : err(DomainError.notFound('Product', query.productId));
  }
}

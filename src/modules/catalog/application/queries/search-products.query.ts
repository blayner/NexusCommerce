import { Inject, Injectable } from '@nestjs/common';
import { mapPage, normalizePage, Paginated } from '../../../../shared/application/pagination';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
  ProductSearchCriteria,
  ProductSort,
} from '../../domain/repositories/product.repository.port';
import { CatalogCache, SEARCH_TTL_SECONDS } from '../catalog-cache';
import { ProductView, toProductView } from '../views/product.view';

export class SearchProductsQuery {
  constructor(
    public readonly filters: {
      text?: string;
      categoryId?: string;
      minPriceInCents?: number;
      maxPriceInCents?: number;
      inStockOnly?: boolean;
      sort?: ProductSort;
      page?: number;
      pageSize?: number;
    },
  ) {}
}

@Injectable()
export class SearchProductsHandler {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    private readonly cache: CatalogCache,
  ) {}

  async execute(query: SearchProductsQuery): Promise<Result<Paginated<ProductView>>> {
    const { filters } = query;
    if (
      filters.minPriceInCents !== undefined &&
      filters.maxPriceInCents !== undefined &&
      filters.minPriceInCents > filters.maxPriceInCents
    ) {
      return err(DomainError.validation('minPrice cannot be greater than maxPrice'));
    }

    const criteria: ProductSearchCriteria = {
      text: filters.text?.trim() || undefined,
      categoryId: filters.categoryId,
      minPriceInCents: filters.minPriceInCents,
      maxPriceInCents: filters.maxPriceInCents,
      inStockOnly: filters.inStockOnly ?? false,
      sort: filters.sort ?? 'newest',
      ...normalizePage(filters),
    };

    const page = await this.cache.client.wrap(
      this.cache.searchKey(criteria),
      SEARCH_TTL_SECONDS,
      async () => mapPage(await this.products.search(criteria), toProductView),
    );
    return ok(page);
  }
}

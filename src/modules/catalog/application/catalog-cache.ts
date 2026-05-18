import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../shared/infrastructure/cache/cache.service';
import { ProductSearchCriteria } from '../domain/repositories/product.repository.port';

export const PRODUCT_TTL_SECONDS = 300;
export const SEARCH_TTL_SECONDS = 60;

const PRODUCT_PREFIX = 'catalog:product:';
const SEARCH_PREFIX = 'catalog:search:';

/**
 * Centralizes catalog cache keys and invalidation rules.
 *
 * Product pages are cached by id and invalidated on every write. Search results are
 * cached for a short TTL and the whole search namespace is dropped on writes that can
 * change result membership (create, price, stock availability).
 */
@Injectable()
export class CatalogCache {
  constructor(private readonly cache: CacheService) {}

  productKey(productId: string): string {
    return `${PRODUCT_PREFIX}${productId}`;
  }

  searchKey(criteria: ProductSearchCriteria): string {
    const canonical = JSON.stringify(
      Object.keys(criteria)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          const value = criteria[key as keyof ProductSearchCriteria];
          if (value !== undefined && value !== '') acc[key] = value;
          return acc;
        }, {}),
    );
    return `${SEARCH_PREFIX}${createHash('sha1').update(canonical).digest('hex')}`;
  }

  get client(): CacheService {
    return this.cache;
  }

  async invalidateProducts(productIds: readonly string[]): Promise<void> {
    await Promise.all([
      this.cache.delete(...productIds.map((id) => this.productKey(id))),
      this.cache.deleteByPrefix(SEARCH_PREFIX),
    ]);
  }

  async invalidateSearches(): Promise<void> {
    await this.cache.deleteByPrefix(SEARCH_PREFIX);
  }
}

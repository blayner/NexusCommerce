import { Paginated } from '../../../../shared/application/pagination';
import { Product } from '../entities/product.entity';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name';

export interface ProductSearchCriteria {
  text?: string;
  categoryId?: string;
  minPriceInCents?: number;
  maxPriceInCents?: number;
  inStockOnly?: boolean;
  includeInactive?: boolean;
  sort?: ProductSort;
  page: number;
  pageSize: number;
}

/**
 * Driven port. Implementations must enforce optimistic concurrency on `save` and throw
 * `DomainException(CONFLICT)` when the stored version differs from `product.version`.
 */
export interface ProductRepositoryPort {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findManyByIds(ids: readonly string[]): Promise<Product[]>;
  search(criteria: ProductSearchCriteria): Promise<Paginated<Product>>;
  save(product: Product): Promise<void>;
  /** Atomically persists several aggregates (all or nothing). */
  saveMany(products: readonly Product[]): Promise<void>;
}

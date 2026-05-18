import { paginate, Paginated } from '../../../../shared/application/pagination';
import { DomainError, DomainException } from '../../../../shared/domain';
import { Product } from '../../domain/entities/product.entity';
import {
  ProductRepositoryPort,
  ProductSearchCriteria,
} from '../../domain/repositories/product.repository.port';
import { ProductMapper, ProductRecord } from '../mappers/product.mapper';

/**
 * Test double that behaves like the real adapter: stores copies (not live references)
 * and enforces optimistic concurrency, so unit tests catch lost-update bugs.
 */
export class InMemoryProductRepository implements ProductRepositoryPort {
  private readonly records = new Map<string, ProductRecord>();

  async findById(id: string): Promise<Product | null> {
    const record = this.records.get(id);
    return record ? ProductMapper.toDomain({ ...record }) : null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const record = [...this.records.values()].find((candidate) => candidate.sku === sku);
    return record ? ProductMapper.toDomain({ ...record }) : null;
  }

  async findManyByIds(ids: readonly string[]): Promise<Product[]> {
    return ids
      .map((id) => this.records.get(id))
      .filter((record): record is ProductRecord => record !== undefined)
      .map((record) => ProductMapper.toDomain({ ...record }));
  }

  async search(criteria: ProductSearchCriteria): Promise<Paginated<Product>> {
    const text = criteria.text?.toLowerCase();
    const filtered = [...this.records.values()].filter((record) => {
      if (!criteria.includeInactive && !record.active) return false;
      if (
        text &&
        !record.name.toLowerCase().includes(text) &&
        !record.sku.toLowerCase().includes(text)
      ) {
        return false;
      }
      if (criteria.categoryId && record.categoryId !== criteria.categoryId) return false;
      if (criteria.minPriceInCents !== undefined && record.priceInCents < criteria.minPriceInCents)
        return false;
      if (criteria.maxPriceInCents !== undefined && record.priceInCents > criteria.maxPriceInCents)
        return false;
      if (criteria.inStockOnly && record.stockOnHand - record.stockReserved <= 0) return false;
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      switch (criteria.sort) {
        case 'price_asc':
          return a.priceInCents - b.priceInCents;
        case 'price_desc':
          return b.priceInCents - a.priceInCents;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.createdAt.getTime() - a.createdAt.getTime();
      }
    });

    const start = (criteria.page - 1) * criteria.pageSize;
    const items = sorted
      .slice(start, start + criteria.pageSize)
      .map((r) => ProductMapper.toDomain({ ...r }));
    return paginate(items, sorted.length, criteria);
  }

  async save(product: Product): Promise<void> {
    this.assertVersion(product);
    this.write(product);
  }

  async saveMany(products: readonly Product[]): Promise<void> {
    products.forEach((product) => this.assertVersion(product)); // validate all before writing any
    products.forEach((product) => this.write(product));
  }

  /** Test helper: simulates a concurrent writer bumping the stored version. */
  bumpVersion(productId: string): void {
    const record = this.records.get(productId);
    if (record) this.records.set(productId, { ...record, version: record.version + 1 });
  }

  private assertVersion(product: Product): void {
    const stored = this.records.get(product.id);
    const storedVersion = stored?.version ?? 0;
    if (storedVersion !== product.version) {
      throw new DomainException(
        DomainError.conflict(`Product ${product.id} was modified concurrently`, {
          expectedVersion: product.version,
          actualVersion: storedVersion,
        }),
      );
    }
  }

  private write(product: Product): void {
    product.markPersisted();
    this.records.set(product.id, ProductMapper.toRecord(product));
  }
}

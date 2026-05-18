import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '../../../../shared/application/event-bus';
import { withOptimisticRetry } from '../../../../shared/application/optimistic-retry';
import { DomainError, err, okVoid, Result } from '../../../../shared/domain';
import { Product } from '../../domain/entities/product.entity';
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from '../../domain/repositories/product.repository.port';
import { CatalogCache } from '../catalog-cache';

export interface StockLine {
  productId: string;
  quantity: number;
}

/** Minimal product data other modules need (cart pricing, order lines). */
export interface ProductSnapshot {
  productId: string;
  sku: string;
  name: string;
  unitPriceInCents: number;
  currency: string;
  availableStock: number;
  active: boolean;
}

type StockMutation = (product: Product, quantity: number) => Result<void>;

/**
 * Public facade of the catalog module. Other modules depend on this service (through
 * their own ports/adapters) instead of reaching into catalog repositories or entities.
 */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    private readonly cache: CatalogCache,
  ) {}

  async getProductSnapshot(productId: string): Promise<ProductSnapshot | null> {
    const product = await this.products.findById(productId);
    return product ? this.toSnapshot(product) : null;
  }

  async getProductSnapshots(productIds: readonly string[]): Promise<ProductSnapshot[]> {
    const products = await this.products.findManyByIds([...new Set(productIds)]);
    return products.map((product) => this.toSnapshot(product));
  }

  /** Reserves every line or none of them (single transaction, optimistic retry). */
  reserveStock(lines: readonly StockLine[]): Promise<Result<void>> {
    return this.mutate(lines, (product, quantity) => product.reserve(quantity));
  }

  releaseStock(lines: readonly StockLine[]): Promise<Result<void>> {
    return this.mutate(lines, (product, quantity) => product.releaseReservation(quantity));
  }

  commitStock(lines: readonly StockLine[]): Promise<Result<void>> {
    return this.mutate(lines, (product, quantity) => product.commitReservation(quantity));
  }

  restock(lines: readonly StockLine[]): Promise<Result<void>> {
    return this.mutate(lines, (product, quantity) => product.restock(quantity));
  }

  private mutate(lines: readonly StockLine[], mutation: StockMutation): Promise<Result<void>> {
    const merged = this.mergeLines(lines);
    if (merged.size === 0) {
      return Promise.resolve(err(DomainError.validation('At least one stock line is required')));
    }

    return withOptimisticRetry(async () => {
      const ids = [...merged.keys()];
      const products = await this.products.findManyByIds(ids);
      const byId = new Map(products.map((product) => [product.id, product]));

      // Apply in a deterministic order to keep behaviour reproducible.
      for (const productId of ids.sort()) {
        const product = byId.get(productId);
        if (!product) return err(DomainError.notFound('Product', productId));

        const outcome = mutation(product, merged.get(productId)!);
        if (!outcome.ok) return outcome;
      }

      await this.products.saveMany(products);
      await this.eventBus.publishAll(products.flatMap((product) => product.pullDomainEvents()));
      await this.cache.invalidateProducts(ids);
      return okVoid();
    });
  }

  private mergeLines(lines: readonly StockLine[]): Map<string, number> {
    const merged = new Map<string, number>();
    for (const line of lines) {
      merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
    }
    return merged;
  }

  private toSnapshot(product: Product): ProductSnapshot {
    return {
      productId: product.id,
      sku: product.sku.value,
      name: product.name,
      unitPriceInCents: product.price.amount.amountInCents,
      currency: product.price.currency,
      availableStock: product.availableStock,
      active: product.active,
    };
  }
}

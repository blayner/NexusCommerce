import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '../../../../shared/application/event-bus';
import { withOptimisticRetry } from '../../../../shared/application/optimistic-retry';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { Product } from '../../domain/entities/product.entity';
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from '../../domain/repositories/product.repository.port';
import { CatalogCache } from '../catalog-cache';

export type StockOperation = 'RESTOCK' | 'ADJUST';

export class UpdateStockCommand {
  constructor(
    public readonly productId: string,
    public readonly operation: StockOperation,
    /** RESTOCK: units to add. ADJUST: new absolute stock-on-hand after a physical count. */
    public readonly quantity: number,
  ) {}
}

@Injectable()
export class UpdateStockHandler {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    private readonly cache: CatalogCache,
  ) {}

  execute(command: UpdateStockCommand): Promise<Result<Product>> {
    return withOptimisticRetry(async () => {
      const product = await this.products.findById(command.productId);
      if (!product) return err(DomainError.notFound('Product', command.productId));

      const outcome =
        command.operation === 'RESTOCK'
          ? product.restock(command.quantity)
          : product.adjustStockOnHand(command.quantity);
      if (!outcome.ok) return outcome;

      await this.products.save(product);
      await this.eventBus.publishAll(product.pullDomainEvents());
      await this.cache.invalidateProducts([product.id]);
      return ok(product);
    });
  }
}

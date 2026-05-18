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

export class ChangePriceCommand {
  constructor(
    public readonly productId: string,
    public readonly priceInCents: number,
    public readonly compareAtPriceInCents?: number | null,
  ) {}
}

@Injectable()
export class ChangePriceHandler {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    private readonly cache: CatalogCache,
  ) {}

  execute(command: ChangePriceCommand): Promise<Result<Product>> {
    return withOptimisticRetry(async () => {
      const product = await this.products.findById(command.productId);
      if (!product) return err(DomainError.notFound('Product', command.productId));

      const changed = product.changePrice(command.priceInCents, command.compareAtPriceInCents);
      if (!changed.ok) return changed;

      await this.products.save(product);
      await this.eventBus.publishAll(product.pullDomainEvents());
      await this.cache.invalidateProducts([product.id]);
      return ok(product);
    });
  }
}

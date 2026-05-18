import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '../../../../shared/application/event-bus';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { CreateProductInput, Product } from '../../domain/entities/product.entity';
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from '../../domain/repositories/category.repository.port';
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from '../../domain/repositories/product.repository.port';
import { Sku } from '../../domain/value-objects/sku.vo';
import { CatalogCache } from '../catalog-cache';

export class CreateProductCommand {
  constructor(public readonly input: CreateProductInput) {}
}

@Injectable()
export class CreateProductHandler {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepositoryPort,
    private readonly eventBus: EventBus,
    private readonly cache: CatalogCache,
  ) {}

  async execute(command: CreateProductCommand): Promise<Result<Product>> {
    const { input } = command;

    const existing = await this.products.findBySku(Sku.normalize(input.sku));
    if (existing) {
      return err(DomainError.conflict(`A product with SKU "${existing.sku.value}" already exists`));
    }

    if (input.categoryId) {
      const category = await this.categories.findById(input.categoryId);
      if (!category) return err(DomainError.notFound('Category', input.categoryId));
    }

    const created = Product.create(input);
    if (!created.ok) return created;

    const product = created.value;
    await this.products.save(product);
    await this.eventBus.publishAll(product.pullDomainEvents());
    await this.cache.invalidateSearches();

    return ok(product);
  }
}

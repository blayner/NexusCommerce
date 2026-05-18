import { DomainError, DomainException, isCurrency, unwrap } from '../../../../shared/domain';
import { Category } from '../../domain/entities/category.entity';
import { Product } from '../../domain/entities/product.entity';
import { Price } from '../../domain/value-objects/price.vo';
import { Sku } from '../../domain/value-objects/sku.vo';

/** Persistence shape (matches the Prisma `Product` model). */
export interface ProductRecord {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  currency: string;
  categoryId: string | null;
  stockOnHand: number;
  stockReserved: number;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductMapper = {
  toDomain(record: ProductRecord): Product {
    if (!isCurrency(record.currency)) {
      throw new DomainException(
        DomainError.invalidState(
          `Unsupported currency "${record.currency}" on product ${record.id}`,
        ),
      );
    }
    return Product.reconstitute(
      {
        name: record.name,
        description: record.description,
        sku: unwrap(Sku.create(record.sku)),
        price: unwrap(
          Price.create(record.priceInCents, record.currency, record.compareAtPriceInCents),
        ),
        categoryId: record.categoryId,
        stockOnHand: record.stockOnHand,
        stockReserved: record.stockReserved,
        active: record.active,
      },
      {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        version: record.version,
      },
    );
  },

  toRecord(product: Product): ProductRecord {
    return {
      id: product.id,
      sku: product.sku.value,
      name: product.name,
      description: product.description,
      priceInCents: product.price.amount.amountInCents,
      compareAtPriceInCents: product.price.compareAt?.amountInCents ?? null,
      currency: product.price.currency,
      categoryId: product.categoryId,
      stockOnHand: product.stockOnHand,
      stockReserved: product.stockReserved,
      active: product.active,
      version: product.version,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  },
};

export const CategoryMapper = {
  toDomain(record: CategoryRecord): Category {
    return Category.reconstitute(
      { name: record.name, slug: record.slug, parentId: record.parentId },
      { id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt },
    );
  },

  toRecord(category: Category): CategoryRecord {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  },
};

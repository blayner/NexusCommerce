import { Category } from '../../domain/entities/category.entity';
import { Product } from '../../domain/entities/product.entity';

/** Read model returned by the catalog API and stored in the cache (plain, serializable). */
export interface ProductView {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: {
    amountInCents: number;
    compareAtInCents: number | null;
    currency: string;
    discountPercentage: number;
  };
  categoryId: string | null;
  availableStock: number;
  inStock: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    sku: product.sku.value,
    name: product.name,
    description: product.description,
    price: {
      amountInCents: product.price.amount.amountInCents,
      compareAtInCents: product.price.compareAt?.amountInCents ?? null,
      currency: product.price.currency,
      discountPercentage: product.price.discountPercentage,
    },
    categoryId: product.categoryId,
    availableStock: product.availableStock,
    inStock: product.isPurchasable,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function toCategoryView(category: Category): CategoryView {
  return { id: category.id, name: category.name, slug: category.slug, parentId: category.parentId };
}

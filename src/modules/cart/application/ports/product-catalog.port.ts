import { Money } from '../../../../shared/domain';

export const PRODUCT_CATALOG_PORT = Symbol('PRODUCT_CATALOG_PORT');

export interface CatalogProduct {
  productId: string;
  sku: string;
  name: string;
  unitPrice: Money;
  availableStock: number;
  active: boolean;
}

/** What the cart needs from the catalog – expressed in the cart's own language. */
export interface ProductCatalogPort {
  getProduct(productId: string): Promise<CatalogProduct | null>;
  getProducts(productIds: readonly string[]): Promise<CatalogProduct[]>;
}

import { Injectable } from '@nestjs/common';
import { isCurrency, Money } from '../../../../shared/domain';
import { CatalogService, ProductSnapshot } from '../../../catalog';
import { CatalogProduct, ProductCatalogPort } from '../../application/ports/product-catalog.port';

/** Anti-corruption layer: translates catalog snapshots into the cart's model. */
@Injectable()
export class CatalogProductAdapter implements ProductCatalogPort {
  constructor(private readonly catalog: CatalogService) {}

  async getProduct(productId: string): Promise<CatalogProduct | null> {
    const snapshot = await this.catalog.getProductSnapshot(productId);
    return snapshot ? this.translate(snapshot) : null;
  }

  async getProducts(productIds: readonly string[]): Promise<CatalogProduct[]> {
    const snapshots = await this.catalog.getProductSnapshots(productIds);
    return snapshots.map((snapshot) => this.translate(snapshot));
  }

  private translate(snapshot: ProductSnapshot): CatalogProduct {
    const currency = isCurrency(snapshot.currency) ? snapshot.currency : 'BRL';
    return {
      productId: snapshot.productId,
      sku: snapshot.sku,
      name: snapshot.name,
      unitPrice: Money.of(snapshot.unitPriceInCents, currency),
      availableStock: snapshot.availableStock,
      active: snapshot.active,
    };
  }
}

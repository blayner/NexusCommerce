import { Injectable } from '@nestjs/common';
import { Result } from '../../../../shared/domain';
import { CatalogService } from '../../../catalog';
import { InventoryLine, InventoryPort } from '../../domain/ports/inventory.port';

/** Inventory port implemented by the catalog module's public facade. */
@Injectable()
export class CatalogInventoryAdapter implements InventoryPort {
  constructor(private readonly catalog: CatalogService) {}

  reserve(lines: readonly InventoryLine[]): Promise<Result<void>> {
    return this.catalog.reserveStock(lines);
  }

  release(lines: readonly InventoryLine[]): Promise<Result<void>> {
    return this.catalog.releaseStock(lines);
  }

  commit(lines: readonly InventoryLine[]): Promise<Result<void>> {
    return this.catalog.commitStock(lines);
  }

  restock(lines: readonly InventoryLine[]): Promise<Result<void>> {
    return this.catalog.restock(lines);
  }
}

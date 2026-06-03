import { Result } from '../../../../shared/domain';

export const INVENTORY_PORT = Symbol('INVENTORY_PORT');

export interface InventoryLine {
  productId: string;
  quantity: number;
}

/** Stock operations the ordering process depends on. All operations are all-or-nothing. */
export interface InventoryPort {
  reserve(lines: readonly InventoryLine[]): Promise<Result<void>>;
  release(lines: readonly InventoryLine[]): Promise<Result<void>>;
  commit(lines: readonly InventoryLine[]): Promise<Result<void>>;
  restock(lines: readonly InventoryLine[]): Promise<Result<void>>;
}

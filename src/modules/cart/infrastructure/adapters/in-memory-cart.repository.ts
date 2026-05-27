import { Cart, CartSnapshot } from '../../domain/entities/cart.entity';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';

/** Serializes through snapshots, exactly like the Redis adapter. */
export class InMemoryCartRepository implements CartRepositoryPort {
  private readonly carts = new Map<string, CartSnapshot>();

  async findByCustomerId(customerId: string): Promise<Cart | null> {
    const snapshot = this.carts.get(customerId);
    return snapshot ? Cart.fromSnapshot(structuredClone(snapshot)) : null;
  }

  async save(cart: Cart): Promise<void> {
    this.carts.set(cart.customerId, cart.toSnapshot());
  }

  async delete(customerId: string): Promise<void> {
    this.carts.delete(customerId);
  }
}

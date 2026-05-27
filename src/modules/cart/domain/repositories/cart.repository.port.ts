import { Cart } from '../entities/cart.entity';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CartRepositoryPort {
  findByCustomerId(customerId: string): Promise<Cart | null>;
  /** Persists the cart; storage TTL must follow `cart.expiresAt`. */
  save(cart: Cart): Promise<void>;
  delete(customerId: string): Promise<void>;
}

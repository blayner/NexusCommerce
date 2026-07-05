import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../shared/infrastructure/cache/redis.provider';
import { Cart, CartSnapshot } from '../../domain/entities/cart.entity';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';

/**
 * Carts are ephemeral, high-churn and keyed by customer – a natural fit for Redis.
 * The key TTL mirrors the aggregate's sliding expiration so abandoned carts vanish
 * without a cleanup job.
 */
@Injectable()
export class RedisCartRepository implements CartRepositoryPort {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async findByCustomerId(customerId: string): Promise<Cart | null> {
    const raw = await this.redis.get(this.key(customerId));
    if (!raw) return null;
    return Cart.fromSnapshot(JSON.parse(raw) as CartSnapshot);
  }

  async save(cart: Cart): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil((cart.expiresAt.getTime() - Date.now()) / 1000));
    await this.redis.set(
      this.key(cart.customerId),
      JSON.stringify(cart.toSnapshot()),
      'EX',
      ttlSeconds,
    );
  }

  async delete(customerId: string): Promise<void> {
    await this.redis.del(this.key(customerId));
  }

  private key(customerId: string): string {
    return `nexus:cart:${customerId}`;
  }
}

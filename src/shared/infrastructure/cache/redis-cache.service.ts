import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { AppMetrics } from '../../application/app-metrics.port';
import { databaseConfig } from '../../../config/database.config';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.provider';

/**
 * Redis-backed cache. Every operation degrades gracefully: a Redis outage turns
 * the cache into a pass-through instead of failing the request.
 */
@Injectable()
export class RedisCacheService extends CacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly keyPrefix = 'nexus:cache:';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(databaseConfig.KEY) private readonly config: ConfigType<typeof databaseConfig>,
    @Optional() metrics?: AppMetrics,
  ) {
    super();
    if (metrics) this.metrics = metrics;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.keyPrefix + key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.warn('get', key, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.config.cache.defaultTtlSeconds;
    try {
      await this.redis.set(this.keyPrefix + key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      this.warn('set', key, error);
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.unlink(...keys.map((key) => this.keyPrefix + key));
    } catch (error) {
      this.warn('delete', keys.join(','), error);
    }
  }

  /** Uses SCAN (non-blocking) instead of KEYS to invalidate a namespace. */
  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    try {
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${this.keyPrefix}${prefix}*`,
          'COUNT',
          200,
        );
        cursor = next;
        if (keys.length > 0) {
          removed += await this.redis.unlink(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.warn('deleteByPrefix', prefix, error);
    }
    return removed;
  }

  private warn(operation: string, key: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Cache ${operation} failed for "${key}": ${message}`);
  }
}

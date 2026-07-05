import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

interface Entry {
  value: string;
  expiresAt: number;
}

/** Process-local cache used by unit tests and local development without Redis. */
@Injectable()
export class InMemoryCacheService extends CacheService {
  private readonly store = new Map<string, Entry>();

  constructor(private readonly defaultTtlSeconds = 300) {
    super();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = (ttlSeconds ?? this.defaultTtlSeconds) * 1000;
    this.store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttl });
  }

  async delete(...keys: string[]): Promise<void> {
    keys.forEach((key) => this.store.delete(key));
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.store.size;
  }
}

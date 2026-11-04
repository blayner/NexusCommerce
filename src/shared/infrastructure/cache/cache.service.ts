/**
 * Application-facing cache abstraction. Declared as an abstract class so it doubles as
 * the Nest DI token, letting tests swap in `InMemoryCacheService` without Redis.
 */
import { AppMetrics, NoopAppMetrics } from '../../application/app-metrics.port';

export abstract class CacheService {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /** Hit/miss counters for `wrap`. Adapters that have a metrics backend replace it. */
  protected metrics: AppMetrics = new NoopAppMetrics();

  abstract get<T>(key: string): Promise<T | null>;
  abstract set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  abstract delete(...keys: string[]): Promise<void>;
  abstract deleteByPrefix(prefix: string): Promise<number>;

  /**
   * Cache-aside read with single-flight: concurrent misses for the same key share one
   * loader call, protecting the database from a cache stampede on hot keys.
   */
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    const namespace = cacheNamespace(key);
    if (cached !== null) {
      this.metrics.cacheLookup(namespace, 'hit');
      return cached;
    }
    this.metrics.cacheLookup(namespace, 'miss');

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const load = (async () => {
      try {
        const value = await loader();
        if (value !== null && value !== undefined) {
          await this.set(key, value, ttlSeconds);
        }
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, load);
    return load;
  }
}

/**
 * Metric label for a cache key: its first two segments (`catalog:product:<id>` ->
 * `catalog:product`), so ids and hashes never become label values.
 */
export function cacheNamespace(key: string): string {
  const segments = key.split(':');
  return segments.length > 2 ? segments.slice(0, 2).join(':') : segments[0] || 'default';
}

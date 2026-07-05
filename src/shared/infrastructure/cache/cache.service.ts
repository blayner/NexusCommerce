/**
 * Application-facing cache abstraction. Declared as an abstract class so it doubles as
 * the Nest DI token, letting tests swap in `InMemoryCacheService` without Redis.
 */
export abstract class CacheService {
  private readonly inFlight = new Map<string, Promise<unknown>>();

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
    if (cached !== null) return cached;

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

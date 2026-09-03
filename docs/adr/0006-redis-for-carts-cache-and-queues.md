# ADR 0006 — Redis for carts, cache and queues

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

- **Carts** are written on almost every interaction, are per-customer, short-lived and
  mostly abandoned. Keeping them in PostgreSQL means churn and a cleanup job.
- **Catalog reads** dominate traffic and tolerate a few seconds of staleness.
- **Slow side effects** (e-mail/SMS/push) and **periodic jobs** (expiring unpaid charges)
  must not run on the request path and must survive restarts.

## Decision

Use Redis 8 for three roles, each behind its own abstraction:

1. **Carts.** `RedisCartRepository` stores a JSON snapshot whose key TTL mirrors the cart's
   sliding expiration, so abandoned carts disappear on their own. Checkout re-validates
   prices and stock against the catalog, so a stale cart is never trusted.
2. **Cache.** `CacheService` (abstract class / DI token) provides cache-aside with
   single-flight to prevent stampedes on hot keys. Product pages are invalidated on write;
   search results use a short TTL and are invalidated by namespace with `SCAN`. Every
   cache error degrades to a pass-through.
3. **Queues.** BullMQ 5 handles notification delivery (retries with exponential backoff,
   job id = notification id for dedup) and a repeatable job expires unpaid payments.
   Repeatable jobs run once per tick across all instances.

## Consequences

- A Redis outage degrades the catalog to direct DB reads and makes carts unavailable. That
  is acceptable for a cart, but would call for a fallback store at larger scale.
- BullMQ requires `maxmemory-policy noeviction` (set in docker-compose) so queue keys are
  never evicted.
- Three roles on one Redis instance is fine at this size. In production, separating the
  cache (evictable) from queues (non-evictable) is advisable.

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
3. **Queues.** BullMQ handles notification delivery (retries with exponential backoff,
   job id = notification id for dedup) and a job scheduler expires unpaid payments
   (originally BullMQ 5 with a repeatable job; see the update below).

## Consequences

- A Redis outage degrades the catalog to direct DB reads and makes carts unavailable. That
  is acceptable for a cart, but would call for a fallback store at larger scale.
- BullMQ requires `maxmemory-policy noeviction` (set in docker-compose) so queue keys are
  never evicted.
- Three roles on one Redis instance is fine at this size. In production, separating the
  cache (evictable) from queues (non-evictable) is advisable.

## Update (2026-10): BullMQ 6 job schedulers

The upgrade to BullMQ 6 removed `repeat` from `JobsOptions`, so repeatable jobs are gone.
The payment expiration now uses a **job scheduler**:
`queue.upsertJobScheduler('expire-overdue-payments', { every: 60_000 }, template)`
(`src/modules/payment/infrastructure/jobs/payment-expiration.processor.ts`).

Why it stays safe with N instances:

- **Upsert by id is idempotent.** Every instance calls it on boot with the same scheduler
  id. The scheduler definition lives in Redis under that id, so the 2nd..Nth calls update
  the same record instead of creating duplicate schedules. With the old repeatable API,
  changing the options produced a *new* repeat key and could leave orphaned schedules.
- **One job per tick.** The scheduler produces the next job with a deterministic id derived
  from the scheduler id and the tick timestamp, so only one job exists per interval no
  matter how many instances are running.
- **One consumer per job.** Workers on every instance compete for that single job through
  BullMQ's atomic Redis operations (job locks), so exactly one worker processes it. If that
  worker crashes, the stalled-job check hands the job to another worker.
- The work itself (`expireOverduePayments`) is also idempotent, since it only touches
  payments still pending past their deadline. A retry after a partial failure is harmless.

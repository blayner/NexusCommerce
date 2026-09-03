# ADR 0004 — Optimistic concurrency for stock

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

Several customers can check out the same product at the same time. Without protection,
two concurrent read-modify-write cycles can both read `available = 1` and both reserve it
(lost update / overselling).

Options considered:

1. **Pessimistic locks** (`SELECT ... FOR UPDATE`). Correct, but locks are held across
   application code. It's also awkward to express through Prisma and prone to deadlocks
   with multi-product carts.
2. **Atomic SQL updates** (`UPDATE ... SET reserved = reserved + n WHERE on_hand - reserved >= n`).
   Fast, but moves the invariants out of the aggregate into SQL.
3. **Optimistic concurrency** on a `version` column.

## Decision

Option 3. Every aggregate carries a `version`. Repositories update with
`WHERE id = ? AND version = ?` and increment it. Zero affected rows raises
`DomainException(CONFLICT)`. Use cases that mutate stock are wrapped in
`withOptimisticRetry`, which reloads and re-applies the change with jittered backoff (3
attempts). Multi-product reservations are saved in one transaction (`saveMany`), and
product IDs are processed in sorted order.

## Consequences

- Invariants stay in the `Product` aggregate (`0 ≤ reserved ≤ onHand`, active-only
  reservations).
- No locks are held while application code runs. Conflicts only cost a retry under real
  contention.
- Under extreme contention on one SKU (flash sales), retries could exhaust. Atomic SQL
  decrements or a Redis-based reservation counter would then be worth the trade-off.
- The in-memory repository enforces the same rule, so unit tests cover the retry path.

# ADR 0005 — Orchestrated saga for checkout

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Placing an order spans three contexts: reserve stock (catalog), charge (payment) and
update the order. There is no single transaction across them, and in the future there may
not even be a shared database. A failure in the middle must leave the system consistent:
no charged customer without an order, no stock reserved for a cancelled order.

## Decision

Use an **orchestration-based saga** (`OrderPlacementSaga`, built on a generic
`SagaOrchestrator`). Each step declares a compensation:

| Step | Compensation |
|---|---|
| reserve-inventory | release reservation |
| charge-payment | refund if captured |
| settle (card approved → commit stock, order PAID) | — |

The order is persisted **before** the saga runs (CONFIRMED) and again after it, so a crash
mid-way leaves a recoverable record. Asynchronous methods (PIX/boleto) end the saga in
`PAYMENT_PENDING` with the reservation held. Settlement then arrives as a payment event,
and a BullMQ job scheduler (`upsertJobScheduler`) expires unpaid charges.

The payment idempotency key is derived from the order id (`order:<id>`), and checkout
accepts an `Idempotency-Key` header, so client retries never create a second order or
charge.

## Consequences

- The whole flow is readable in one place and unit-testable with fake ports.
- Compensations must be idempotent. A failed compensation is logged loudly and needs
  manual follow-up; a dead-letter/reconciliation process would be next.
- Choreography (each module reacting to events) was rejected for checkout because the flow
  would be spread across modules and harder to reason about. It is still used for
  post-checkout reactions (ADR 0003).

## Update (2026-10)

The expiration of unpaid charges originally used a BullMQ 5 *repeatable job*. BullMQ 6
removed `repeat` from job options, so the job now uses a **job scheduler**
(`queue.upsertJobScheduler`). The saga's decision is unchanged; see ADR 0006 for why the
scheduler stays safe with several instances running.

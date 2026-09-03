# ADR 0003 — In-process domain events

- **Status:** Accepted (revisit when a module is extracted)
- **Date:** 2026-06-20

## Context

Some reactions cross module boundaries but must not be part of the caller's use case:

- the order must react to asynchronous payment settlement (PIX/boleto webhook, expiration);
- customers must be notified when an order is placed, paid, shipped or cancelled.

A direct call would make payment depend on order, and order depend on notification.

## Decision

Aggregates record `DomainEvent`s with namespaced names (`payment.payment.approved`,
`order.order.paid`, ...). After a successful save, the application service publishes them
on a lightweight in-process `EventBus`. Subscribers register in `onModuleInit`. Handler
failures are isolated and logged, so a failing subscriber never fails the publisher's
transaction.

Subscribers must be **idempotent** and tolerate out-of-order delivery. Examples:
`OrderService.onPaymentApproved` ignores orders that aren't `PAYMENT_PENDING`, and
notifications are deduplicated by `eventName:aggregateId:channel`.

## Consequences

- Clear dependency direction, no circular module imports.
- Publishing happens **after** the database write and is not atomic with it. If the
  process crashes between the two, the event is lost. Today the impact is a missing e-mail
  or a pending order that the expiration job eventually resolves.
- **Next step:** a transactional outbox (an events table written in the same transaction
  and relayed by a BullMQ job). The same step is required before any subscriber moves to
  another service.

# ADR 0002 — Hexagonal architecture with consumer-owned ports

- **Status:** Accepted
- **Date:** 2026-05-18

## Context

Business rules such as stock invariants, order lifecycle and pricing must be testable
without a database, Redis or HTTP. Modules also need to talk to each other without
coupling to each other's internals.

## Decision

- The **domain layer** is plain TypeScript: entities, value objects, domain services,
  events and **port interfaces**. It imports nothing from NestJS or Prisma.
- Fallible operations return `Result<T, DomainError>`. Exceptions are reserved for
  programming errors and infrastructure failures.
- **Ports are defined by the consumer, in its own language.** For example, the order module
  declares `InventoryPort`, `PaymentGatewayPort` and `CheckoutSourcePort`. Adapters in
  `order/infrastructure` implement them by calling the providers' public facades
  (`CatalogService`, `PaymentService`, `CartService`), acting as an anti-corruption layer.
- Nest modules only do wiring (`{ provide: PORT, useClass: Adapter }`).
- Every repository port has an in-memory adapter with the same semantics: it copies on
  read/write and enforces optimistic locking.

## Consequences

- Use cases and the saga are unit-tested with fakes in milliseconds.
- Swapping Prisma, Redis, or an in-process call for a remote one only touches an adapter.
- More files and mapping code (domain ↔ persistence ↔ view). The cost is deliberate and
  limited to the core contexts. The `identity` module is a supporting subdomain and stays
  a thin service.

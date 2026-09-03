# ADR 0001 — Modular monolith instead of microservices

- **Status:** Accepted
- **Date:** 2026-05-10

## Context

The platform has several clearly separable subdomains (catalog, cart, ordering, payments,
notifications). A small team will build it. Requirements are still changing, and
boundaries between contexts are likely to move during the first iterations.

Microservices would give independent deployment and scaling. They would also bring
distributed transactions, network failure handling, contract versioning and operational
overhead from day one, before we know where the real seams are.

## Decision

Build a single NestJS deployable where each bounded context is a **module with hard
boundaries**:

- its own folder with `domain / application / infrastructure / presentation` layers;
- its own tables. Cross-context references are IDs only, never foreign keys;
- a **public API** (`index.ts`) that other modules must use. Internals are never imported;
- communication through consumer-owned ports (synchronous) or domain events (asynchronous).

## Consequences

- One build, one deployment, local transactions where a context needs them, easy debugging.
- Extraction stays cheap. Turning `notification` into a service only means replacing the
  in-process `EventBus` subscription with a broker consumer. `payment` would need a new
  `PaymentGatewayPort` adapter that calls HTTP instead of the in-process facade.
- Boundaries are enforced by convention and code review rather than by the network. A
  dependency-rule linter (e.g. dependency-cruiser) would be a natural addition.
- All modules scale together. That's acceptable at this stage; the hot read path (catalog)
  is cached.

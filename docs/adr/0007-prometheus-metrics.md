# ADR 0007 — Prometheus metrics behind an `AppMetrics` port

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

Until now the service was observable only through structured access logs (with
`x-request-id`) and the `/health/live` / `/health/ready` probes. Logs tell you *what happened to
one request*. They are a poor fit for questions like "what is the p95 latency of checkout?",
"how many PIX charges are pending vs approved per hour?", "is the cache hit ratio dropping?" or
"are notification jobs failing?". Those questions need cheap, aggregated **time series** that can
drive dashboards and alerts.

## Decision

1. **Expose Prometheus metrics** at `GET /metrics`, outside the `/api/v1` prefix (like the health
   checks) and marked `@Public()` so the global JWT guard does not block the scraper. The client is
   `@prometheus-io/client`, the maintained successor of the deprecated `prom-client`, with the same
   API.
2. **Keep metrics behind a port.** Application code (`PaymentService`, `CacheService`, BullMQ
   processors) depends on the abstract `AppMetrics` class in `src/shared/application`.
   `PrometheusAppMetrics` (infrastructure) is the adapter; `NoopAppMetrics` is the default when no
   backend is wired, e.g. in unit tests that build services by hand. The domain layer has no metrics
   code at all.
3. **Count order transitions from domain events.** `OrderMetricsSubscriber` subscribes to the
   `order.order.*` events on the `EventBus`. Events are published after the aggregate is persisted,
   so a counted transition really happened, and the `Order` aggregate stays untouched.
4. **Measure HTTP at the edge.** `HttpMetricsInterceptor` records a latency histogram per
   `method`, `route` and `status_code`. The status is read on the response `finish` event, i.e.
   *after* `DomainExceptionFilter` has mapped domain errors, so a 409 is recorded as 409 and not as
   a 500.
5. **Use a dedicated `Registry`** per `PrometheusAppMetrics` instance instead of the library's
   global registry. Each app instance, including the ones tests create in the same process, gets
   isolated metrics, and re-creating the module never fails with "metric already registered".
6. **Cardinality rules.** Every label value must come from a small, closed set:
   - `route` is the **route template** (`/api/v1/products/:id`), never the raw URL. Unmatched
     requests get `route="unmatched"`.
   - Cache keys are reduced to their namespace (`catalog:product`, `catalog:search`); ids and
     search hashes never become labels.
   - Payment `method` and `outcome` and job `queue` and `outcome` are enums.
   - No user ids, order ids, e-mails or free-text reasons, ever. That is what logs and traces are
     for.

   Each new label value creates a new time series in Prometheus. A raw URL or an id label grows
   memory without bound and can take down the monitoring system itself.

## Why pull (Prometheus) instead of push

- The scraper decides the interval, and a down target is visible immediately (`up == 0`) without
  extra heartbeat logic.
- The app keeps counters in memory and does no network I/O on the request path for metrics.
- It is the de-facto standard in Kubernetes and Docker environments. The same `/metrics` endpoint
  works with Prometheus, Grafana Agent/Alloy, the OpenTelemetry Collector's Prometheus receiver
  and most managed services.
- Push (or OTLP push) suits short-lived jobs and serverless workloads. This is a long-running
  service, so pull fits.

## Why not OpenTelemetry (yet)

OpenTelemetry would give traces, metrics and logs under one API and vendor-neutral export
(OTLP). It is the right long-term direction. For this step the goal was the business and runtime metrics with the fewest moving parts:

- The Prometheus client is a single dependency with no collector to run, and the exposition
  format is what the scraper reads anyway.
- The `AppMetrics` port makes the switch cheap. An `OtelAppMetrics` adapter could replace
  `PrometheusAppMetrics` without touching application code.

The next observability step is **OpenTelemetry tracing** (HTTP, Prisma, ioredis, BullMQ
propagation across the queue), and possibly moving metrics to the OTel SDK with a Prometheus
exporter so both signals share resource attributes.

## Consequences

- Dashboards and alerts can be built on latency (RED method: rate, errors, duration), cache hit
  ratio, payment outcomes per method, order funnel and job failures.
- `/metrics` is public at the application level. In production it must be reachable only from the
  internal network or the scraper (network policy, separate port or reverse-proxy rule). It
  exposes no personal data, only aggregates.
- Counters are per instance. Prometheus aggregates across instances (`sum by (...)`), so restarts
  reset the counters and queries must use `rate()` / `increase()`, as usual.
- The docker-compose file gains an optional `observability` profile with Prometheus
  (`ops/prometheus/prometheus.yml`), so the default `docker compose up` stays lean.

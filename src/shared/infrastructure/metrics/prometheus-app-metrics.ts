import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client';
import {
  AppMetrics,
  CacheLookupResult,
  JobOutcome,
  PaymentAttemptOutcome,
} from '../../application/app-metrics.port';

export type OrderTransition = 'placed' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export interface PrometheusAppMetricsOptions {
  /** Process metrics (CPU, memory, event loop lag, GC). Off in unit tests. */
  collectDefaults?: boolean;
}

/**
 * Prometheus adapter for `AppMetrics`, plus the HTTP and order metrics recorded by
 * infrastructure (interceptor, domain-event subscriber).
 *
 * Uses its own `Registry` instead of the library's global one, so each app instance
 * (including the ones created by tests in the same process) has isolated metrics and
 * re-creating the module never fails with "metric already registered".
 */
export class PrometheusAppMetrics extends AppMetrics {
  readonly registry = new Registry();

  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  readonly orderTransitions: Counter<'transition'>;
  readonly orderCancellations: Counter<'from_status'>;
  readonly paymentAttempts: Counter<'method' | 'outcome'>;
  readonly cacheLookups: Counter<'namespace' | 'result'>;
  readonly jobs: Counter<'queue' | 'outcome'>;
  readonly jobDuration: Histogram<'queue' | 'outcome'>;

  constructor(options: PrometheusAppMetricsOptions = {}) {
    super();
    if (options.collectDefaults) {
      collectDefaultMetrics({ register: this.registry, prefix: 'nexus_' });
    }
    const registers = [this.registry];

    this.httpRequestDuration = new Histogram({
      name: 'nexus_http_request_duration_seconds',
      help: 'HTTP request latency by method, route template and status code',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers,
    });
    this.orderTransitions = new Counter({
      name: 'nexus_order_transitions_total',
      help: 'Order lifecycle transitions, by transition',
      labelNames: ['transition'],
      registers,
    });
    this.orderCancellations = new Counter({
      name: 'nexus_order_cancellations_total',
      help: 'Cancelled orders, by the status they were in when cancelled',
      labelNames: ['from_status'],
      registers,
    });
    this.paymentAttempts = new Counter({
      name: 'nexus_payment_attempts_total',
      help: 'Charge attempts by payment method (strategy) and outcome',
      labelNames: ['method', 'outcome'],
      registers,
    });
    this.cacheLookups = new Counter({
      name: 'nexus_cache_lookups_total',
      help: 'Cache-aside lookups by key namespace and result (hit/miss)',
      labelNames: ['namespace', 'result'],
      registers,
    });
    this.jobs = new Counter({
      name: 'nexus_queue_jobs_total',
      help: 'BullMQ job attempts processed by this instance, by queue and outcome',
      labelNames: ['queue', 'outcome'],
      registers,
    });
    this.jobDuration = new Histogram({
      name: 'nexus_queue_job_duration_seconds',
      help: 'BullMQ job processing time, by queue and outcome',
      labelNames: ['queue', 'outcome'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers,
    });
  }

  paymentAttempt(method: string, outcome: PaymentAttemptOutcome): void {
    this.paymentAttempts.inc({ method: method.toLowerCase(), outcome });
  }

  cacheLookup(namespace: string, result: CacheLookupResult): void {
    this.cacheLookups.inc({ namespace, result });
  }

  jobProcessed(queue: string, outcome: JobOutcome, durationSeconds: number): void {
    this.jobs.inc({ queue, outcome });
    this.jobDuration.observe({ queue, outcome }, durationSeconds);
  }

  orderTransition(transition: OrderTransition): void {
    this.orderTransitions.inc({ transition });
  }

  orderCancelled(fromStatus: string): void {
    this.orderCancellations.inc({ from_status: fromStatus });
  }

  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationSeconds,
    );
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}

/**
 * Port for business/runtime metrics recorded by application code.
 *
 * Application services depend on this abstract class (which doubles as the Nest DI token)
 * instead of a Prometheus client, so the domain and application layers stay free of
 * observability vendors. `PrometheusAppMetrics` is the production adapter; tests and
 * code paths without a metrics backend fall back to `NoopAppMetrics`.
 *
 * Label values must come from small, closed sets (method names, outcomes, namespaces),
 * never from ids, e-mails or raw URLs. See docs/adr/0007-prometheus-metrics.md.
 */
export type PaymentAttemptOutcome = 'approved' | 'pending' | 'declined';
export type CacheLookupResult = 'hit' | 'miss';
export type JobOutcome = 'completed' | 'failed';

export abstract class AppMetrics {
  abstract paymentAttempt(method: string, outcome: PaymentAttemptOutcome): void;
  abstract cacheLookup(namespace: string, result: CacheLookupResult): void;
  abstract jobProcessed(queue: string, outcome: JobOutcome, durationSeconds: number): void;
}

export class NoopAppMetrics extends AppMetrics {
  paymentAttempt(): void {}
  cacheLookup(): void {}
  jobProcessed(): void {}
}

/**
 * Runs a queue job and records its outcome and duration. Failures are recorded and then
 * re-thrown, so BullMQ still applies its retry/backoff policy.
 */
export async function instrumentJob<T>(
  metrics: AppMetrics,
  queue: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = process.hrtime.bigint();
  const elapsed = () => Number(process.hrtime.bigint() - startedAt) / 1e9;
  try {
    const result = await run();
    metrics.jobProcessed(queue, 'completed', elapsed());
    return result;
  } catch (error) {
    metrics.jobProcessed(queue, 'failed', elapsed());
    throw error;
  }
}

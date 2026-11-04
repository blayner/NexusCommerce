import { Counter, Histogram } from '@prometheus-io/client';

type Labels = Record<string, string | number>;

function matches(labels: Partial<Record<string, string | number>>, expected: Labels): boolean {
  return Object.entries(expected).every(([key, value]) => String(labels[key]) === String(value));
}

/** Current value of a counter for an exact label set (0 if never incremented). */
export async function counterValue(counter: Counter<string>, labels: Labels): Promise<number> {
  const { values } = await counter.get();
  return values.find((v) => matches(v.labels, labels))?.value ?? 0;
}

/** Number of observations a histogram recorded for an exact label set. */
export async function histogramCount(
  histogram: Histogram<string>,
  labels: Labels,
): Promise<number> {
  const { values } = await histogram.get();
  return (
    values.find((v) => v.metricName?.endsWith('_count') && matches(v.labels, labels))?.value ?? 0
  );
}

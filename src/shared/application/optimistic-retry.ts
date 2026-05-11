import { DomainException } from '../domain/domain-error';

/**
 * Re-runs a read-modify-write unit when the repository detects a concurrent update
 * (optimistic locking conflict). The callback must reload aggregates on every attempt.
 */
export async function withOptimisticRetry<T>(
  operation: (attempt: number) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let attempt = 1;
  for (;;) {
    try {
      return await operation(attempt);
    } catch (error) {
      const isConflict = error instanceof DomainException && error.code === 'CONFLICT';
      if (!isConflict || attempt >= maxAttempts) throw error;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt + Math.random() * 10));
    }
  }
}

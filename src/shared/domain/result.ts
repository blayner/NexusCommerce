import { DomainError, DomainException } from './domain-error';

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Discriminated union used for every fallible domain/application operation.
 * Narrow with `if (!result.ok) return result;` to propagate failures without exceptions.
 */
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const okVoid = (): Ok<void> => ({ ok: true, value: undefined });

export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Collects all values or returns the first error. */
export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

/** Unwraps a result at the application boundary, converting errors into exceptions. */
export function unwrap<T>(result: Result<T, DomainError>): T {
  if (result.ok) return result.value;
  throw new DomainException(result.error);
}

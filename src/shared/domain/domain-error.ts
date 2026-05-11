export type DomainErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'BUSINESS_RULE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

/**
 * Expected, recoverable failure of a domain operation.
 *
 * Domain code never throws for business outcomes – it returns a `Result` carrying
 * a `DomainError`. The presentation layer translates the error code into an HTTP status.
 */
export class DomainError {
  constructor(
    public readonly code: DomainErrorCode,
    public readonly message: string,
    public readonly details?: Record<string, unknown>,
  ) {}

  static validation(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('VALIDATION', message, details);
  }

  static notFound(entity: string, id: string): DomainError {
    return new DomainError('NOT_FOUND', `${entity} "${id}" was not found`, { entity, id });
  }

  static conflict(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('CONFLICT', message, details);
  }

  static invalidState(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('INVALID_STATE', message, details);
  }

  static businessRule(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('BUSINESS_RULE', message, details);
  }

  static unauthorized(message = 'Invalid credentials'): DomainError {
    return new DomainError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'You are not allowed to perform this action'): DomainError {
    return new DomainError('FORBIDDEN', message);
  }

  withDetails(details: Record<string, unknown>): DomainError {
    return new DomainError(this.code, this.message, { ...this.details, ...details });
  }
}

/**
 * Exception wrapper used at the application boundary (and for invariant violations
 * that indicate programming errors, e.g. reconstituting corrupted persisted data).
 */
export class DomainException extends Error {
  constructor(public readonly error: DomainError) {
    super(error.message);
    this.name = 'DomainException';
  }

  get code(): DomainErrorCode {
    return this.error.code;
  }
}

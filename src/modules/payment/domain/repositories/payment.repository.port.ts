import { Payment } from '../entities/payment.entity';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface PaymentRepositoryPort {
  findById(id: string): Promise<Payment | null>;
  findByIdempotencyKey(key: string): Promise<Payment | null>;
  findByProviderReference(reference: string): Promise<Payment | null>;
  findOverduePending(now: Date, limit: number): Promise<Payment[]>;
  /**
   * Inserting a payment whose idempotency key already exists must throw
   * `DomainException(CONFLICT)` – the unique constraint is the real idempotency guard.
   */
  save(payment: Payment): Promise<void>;
}

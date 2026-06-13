import { DomainError, DomainException } from '../../../../shared/domain';
import { Payment, PaymentStatus } from '../../domain/entities/payment.entity';
import { PaymentRepositoryPort } from '../../domain/repositories/payment.repository.port';
import { PaymentMapper, PaymentRecord } from '../mappers/payment.mapper';

export class InMemoryPaymentRepository implements PaymentRepositoryPort {
  private readonly records = new Map<string, PaymentRecord>();

  async findById(id: string): Promise<Payment | null> {
    return this.load(this.records.get(id));
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    return this.load([...this.records.values()].find((record) => record.idempotencyKey === key));
  }

  async findByProviderReference(reference: string): Promise<Payment | null> {
    return this.load(
      [...this.records.values()].find((record) => record.providerReference === reference),
    );
  }

  async findOverduePending(now: Date, limit: number): Promise<Payment[]> {
    return [...this.records.values()]
      .filter(
        (r) =>
          r.status === (PaymentStatus.Pending as string) &&
          r.expiresAt !== null &&
          r.expiresAt <= now,
      )
      .slice(0, limit)
      .map((record) => PaymentMapper.toDomain(structuredClone(record)));
  }

  async save(payment: Payment): Promise<void> {
    const stored = this.records.get(payment.id);
    if ((stored?.version ?? 0) !== payment.version) {
      throw new DomainException(
        DomainError.conflict(`Payment ${payment.id} was modified concurrently`),
      );
    }
    if (
      !stored &&
      [...this.records.values()].some((r) => r.idempotencyKey === payment.idempotencyKey)
    ) {
      throw new DomainException(DomainError.conflict('Duplicate idempotency key'));
    }
    payment.markPersisted();
    this.records.set(payment.id, PaymentMapper.toRecord(payment));
  }

  get count(): number {
    return this.records.size;
  }

  private load(record: PaymentRecord | undefined): Payment | null {
    return record ? PaymentMapper.toDomain(structuredClone(record)) : null;
  }
}

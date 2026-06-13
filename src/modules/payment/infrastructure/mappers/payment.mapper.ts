import { DomainError, DomainException, isCurrency, Money, unwrap } from '../../../../shared/domain';
import { Payment, PaymentStatus } from '../../domain/entities/payment.entity';
import { PaymentMethod, PaymentMethodDetails } from '../../domain/value-objects/payment-method.vo';

export interface PaymentRecord {
  id: string;
  orderId: string;
  customerId: string;
  amountInCents: number;
  currency: string;
  method: string;
  methodDetails: unknown;
  status: string;
  idempotencyKey: string;
  providerReference: string | null;
  declineReason: string | null;
  instructions: unknown;
  expiresAt: Date | null;
  refundedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const STATUSES = new Set<string>(Object.values(PaymentStatus));

export const PaymentMapper = {
  toDomain(record: PaymentRecord): Payment {
    if (!isCurrency(record.currency) || !STATUSES.has(record.status)) {
      throw new DomainException(DomainError.invalidState(`Corrupted payment record ${record.id}`));
    }
    return Payment.reconstitute(
      {
        orderId: record.orderId,
        customerId: record.customerId,
        amount: Money.of(record.amountInCents, record.currency),
        method: unwrap(PaymentMethod.create(record.methodDetails as PaymentMethodDetails)),
        status: record.status as PaymentStatus,
        idempotencyKey: record.idempotencyKey,
        providerReference: record.providerReference,
        declineReason: record.declineReason,
        instructions: (record.instructions as Record<string, string> | null) ?? null,
        expiresAt: record.expiresAt,
        refundedAt: record.refundedAt,
      },
      {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        version: record.version,
      },
    );
  },

  /**
   * Card tokens are single-use gateway references; they are kept so refunds can be
   * routed, but never logged or returned by the API (see PaymentMethod.toPublicJSON).
   */
  toRecord(payment: Payment): PaymentRecord {
    return {
      id: payment.id,
      orderId: payment.orderId,
      customerId: payment.customerId,
      amountInCents: payment.amount.amountInCents,
      currency: payment.amount.currency,
      method: payment.method.type,
      methodDetails: payment.method.details,
      status: payment.status,
      idempotencyKey: payment.idempotencyKey,
      providerReference: payment.providerReference,
      declineReason: payment.declineReason,
      instructions: payment.instructions,
      expiresAt: payment.expiresAt,
      refundedAt: payment.refundedAt,
      version: payment.version,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  },
};

import { Payment } from '../../domain/entities/payment.entity';

export interface PaymentView {
  id: string;
  orderId: string;
  status: string;
  method: Record<string, unknown>;
  amountInCents: number;
  currency: string;
  instructions: Record<string, string> | null;
  declineReason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function toPaymentView(payment: Payment): PaymentView {
  return {
    id: payment.id,
    orderId: payment.orderId,
    status: payment.status,
    method: payment.method.toPublicJSON(),
    amountInCents: payment.amount.amountInCents,
    currency: payment.amount.currency,
    instructions: payment.instructions,
    declineReason: payment.declineReason,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

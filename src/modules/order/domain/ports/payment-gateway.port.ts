import { Currency, Result } from '../../../../shared/domain';

export const PAYMENT_GATEWAY_PORT = Symbol('PAYMENT_GATEWAY_PORT');

export type CheckoutPaymentMethod =
  | { type: 'CREDIT_CARD'; cardToken: string; installments: number }
  | { type: 'PIX' }
  | { type: 'BOLETO'; customerDocument: string; customerName: string };

export interface ChargeRequest {
  orderId: string;
  customerId: string;
  amountInCents: number;
  currency: Currency;
  method: CheckoutPaymentMethod;
  idempotencyKey: string;
}

export type ChargeOutcome =
  | { status: 'APPROVED'; paymentId: string }
  | {
      status: 'PENDING';
      paymentId: string;
      instructions: Record<string, string> | null;
      expiresAt: Date | null;
    }
  | { status: 'DECLINED'; paymentId: string; reason: string };

export interface PaymentGatewayPort {
  charge(request: ChargeRequest): Promise<Result<ChargeOutcome>>;
  refund(paymentId: string): Promise<Result<void>>;
}

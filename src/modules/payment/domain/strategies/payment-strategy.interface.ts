import { Payment } from '../entities/payment.entity';
import { PaymentMethodType } from '../value-objects/payment-method.vo';

export type StrategyOutcome =
  | { status: 'APPROVED'; providerReference: string }
  | {
      status: 'PENDING';
      providerReference: string;
      instructions: Record<string, string>;
      expiresAt: Date;
    }
  | { status: 'DECLINED'; reason: string };

/**
 * Strategy pattern: one implementation per payment method. New methods (e.g. wallet,
 * BNPL) are added by registering another strategy – the PaymentService stays closed
 * for modification.
 */
export interface PaymentStrategy {
  readonly method: PaymentMethodType;
  execute(payment: Payment): Promise<StrategyOutcome>;
  refund(payment: Payment): Promise<void>;
}

export const PAYMENT_STRATEGIES = Symbol('PAYMENT_STRATEGIES');

import { randomUUID } from 'crypto';
import { Payment } from '../entities/payment.entity';
import { PaymentStrategy, StrategyOutcome } from './payment-strategy.interface';

/** Minimum value of each installment (R$ 5,00), a common acquirer rule. */
export const MIN_INSTALLMENT_IN_CENTS = 500;

/**
 * Sandbox acquirer. Test tokens follow the convention used by most gateways:
 *  - tok_declined            -> generic decline
 *  - tok_insufficient_funds  -> insufficient funds
 *  - anything else           -> approved
 * In production this class would wrap the acquirer SDK/HTTP API.
 */
export class CreditCardStrategy implements PaymentStrategy {
  readonly method = 'CREDIT_CARD' as const;

  async execute(payment: Payment): Promise<StrategyOutcome> {
    const details = payment.method.details;
    if (details.type !== 'CREDIT_CARD') {
      return { status: 'DECLINED', reason: 'Payment method mismatch' };
    }

    const installments = payment.amount.allocate(details.installments);
    const smallest = installments[installments.length - 1];
    if (details.installments > 1 && smallest.amountInCents < MIN_INSTALLMENT_IN_CENTS) {
      return {
        status: 'DECLINED',
        reason: `Each installment must be at least R$ ${(MIN_INSTALLMENT_IN_CENTS / 100).toFixed(2)}`,
      };
    }

    switch (details.cardToken) {
      case 'tok_declined':
        return { status: 'DECLINED', reason: 'Card declined by issuer' };
      case 'tok_insufficient_funds':
        return { status: 'DECLINED', reason: 'Insufficient funds' };
      default:
        return { status: 'APPROVED', providerReference: `cc_${randomUUID()}` };
    }
  }

  async refund(_payment: Payment): Promise<void> {
    // Sandbox: refunds always succeed. A real acquirer call would go here.
  }
}

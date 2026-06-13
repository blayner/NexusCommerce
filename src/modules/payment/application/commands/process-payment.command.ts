import { Currency } from '../../../../shared/domain';
import { PaymentMethodDetails } from '../../domain/value-objects/payment-method.vo';

export class ProcessPaymentCommand {
  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly amountInCents: number,
    public readonly currency: Currency,
    public readonly method: PaymentMethodDetails,
    /** Client-supplied (or derived from the order) key that makes retries safe. */
    public readonly idempotencyKey: string,
  ) {}
}

export type ProviderNotificationStatus = 'APPROVED' | 'DECLINED';

export class ConfirmProviderNotificationCommand {
  constructor(
    public readonly providerReference: string,
    public readonly status: ProviderNotificationStatus,
    public readonly reason?: string,
  ) {}
}

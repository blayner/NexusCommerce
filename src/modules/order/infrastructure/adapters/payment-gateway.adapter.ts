import { Injectable } from '@nestjs/common';
import { ok, okVoid, Result } from '../../../../shared/domain';
import { PaymentService, PaymentStatus, ProcessPaymentCommand } from '../../../payment';
import {
  ChargeOutcome,
  ChargeRequest,
  PaymentGatewayPort,
} from '../../domain/ports/payment-gateway.port';

/** Translates between the order's view of payments and the payment module's API. */
@Injectable()
export class PaymentGatewayAdapter implements PaymentGatewayPort {
  constructor(private readonly payments: PaymentService) {}

  async charge(request: ChargeRequest): Promise<Result<ChargeOutcome>> {
    const processed = await this.payments.process(
      new ProcessPaymentCommand(
        request.orderId,
        request.customerId,
        request.amountInCents,
        request.currency,
        request.method,
        request.idempotencyKey,
      ),
    );
    if (!processed.ok) return processed;

    const payment = processed.value;
    switch (payment.status) {
      case PaymentStatus.Approved:
        return ok({ status: 'APPROVED', paymentId: payment.id });
      case PaymentStatus.Pending:
        return ok({
          status: 'PENDING',
          paymentId: payment.id,
          instructions: payment.instructions,
          expiresAt: payment.expiresAt,
        });
      default:
        return ok({
          status: 'DECLINED',
          paymentId: payment.id,
          reason: payment.declineReason ?? payment.status,
        });
    }
  }

  async refund(paymentId: string): Promise<Result<void>> {
    const refunded = await this.payments.refund(paymentId);
    return refunded.ok ? okVoid() : refunded;
  }
}

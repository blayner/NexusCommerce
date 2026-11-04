import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  AppMetrics,
  NoopAppMetrics,
  PaymentAttemptOutcome,
} from '../../../../shared/application/app-metrics.port';
import { EventBus } from '../../../../shared/application/event-bus';
import { DomainError, DomainException, err, Money, ok, Result } from '../../../../shared/domain';
import { Payment } from '../../domain/entities/payment.entity';
import {
  PAYMENT_REPOSITORY,
  PaymentRepositoryPort,
} from '../../domain/repositories/payment.repository.port';
import { StrategyOutcome } from '../../domain/strategies/payment-strategy.interface';
import { PaymentStrategyResolver } from '../../domain/strategies/payment-strategy.resolver';
import { PaymentMethod } from '../../domain/value-objects/payment-method.vo';
import {
  ConfirmProviderNotificationCommand,
  ProcessPaymentCommand,
} from '../commands/process-payment.command';

const OUTCOME_LABELS: Record<StrategyOutcome['status'], PaymentAttemptOutcome> = {
  APPROVED: 'approved',
  PENDING: 'pending',
  DECLINED: 'declined',
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
    private readonly strategies: PaymentStrategyResolver,
    private readonly eventBus: EventBus,
    @Optional() private readonly metrics: AppMetrics = new NoopAppMetrics(),
  ) {}

  /**
   * Idempotent charge: replaying the same idempotency key returns the original payment
   * instead of charging twice; reusing the key for a different charge is rejected.
   */
  async process(command: ProcessPaymentCommand): Promise<Result<Payment>> {
    if (!Number.isInteger(command.amountInCents) || command.amountInCents <= 0) {
      return err(DomainError.validation('Amount must be a positive integer in cents'));
    }
    const amount = Money.of(command.amountInCents, command.currency);

    const replay = await this.findReplay(command, amount);
    if (replay) return replay;

    const method = PaymentMethod.create(command.method);
    if (!method.ok) return method;

    const initiated = Payment.initiate({
      orderId: command.orderId,
      customerId: command.customerId,
      amount,
      method: method.value,
      idempotencyKey: command.idempotencyKey,
    });
    if (!initiated.ok) return initiated;
    const payment = initiated.value;

    // Persist BEFORE calling the provider: the unique idempotency key wins races
    // between concurrent retries, and we never lose track of an attempted charge.
    try {
      await this.payments.save(payment);
    } catch (error) {
      if (error instanceof DomainException && error.code === 'CONFLICT') {
        const raced = await this.findReplay(command, amount);
        if (raced) return raced;
      }
      throw error;
    }

    const outcome = await this.executeStrategy(payment);
    this.metrics.paymentAttempt(payment.method.type, OUTCOME_LABELS[outcome.status]);
    const applied = this.applyOutcome(payment, outcome);
    if (!applied.ok) return applied;

    await this.payments.save(payment);
    await this.eventBus.publishAll(payment.pullDomainEvents());
    return ok(payment);
  }

  /** Asynchronous settlement notification (PIX paid, boleto compensated, ...). */
  async confirmProviderNotification(
    command: ConfirmProviderNotificationCommand,
  ): Promise<Result<Payment>> {
    const payment = await this.payments.findByProviderReference(command.providerReference);
    if (!payment) return err(DomainError.notFound('Payment', command.providerReference));

    const result =
      command.status === 'APPROVED'
        ? payment.approve(command.providerReference)
        : payment.decline(command.reason ?? 'Declined by provider');
    if (!result.ok) return result;

    await this.payments.save(payment);
    await this.eventBus.publishAll(payment.pullDomainEvents());
    return ok(payment);
  }

  async refund(paymentId: string): Promise<Result<Payment>> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) return err(DomainError.notFound('Payment', paymentId));

    const refunded = payment.refund();
    if (!refunded.ok) return refunded;

    await this.strategies.resolve(payment.method.type).refund(payment);
    await this.payments.save(payment);
    await this.eventBus.publishAll(payment.pullDomainEvents());
    return ok(payment);
  }

  /** Expires PIX/boleto charges that were never paid (run periodically by a BullMQ job). */
  async expireOverduePayments(now: Date = new Date(), batchSize = 100): Promise<number> {
    const overdue = await this.payments.findOverduePending(now, batchSize);
    let expired = 0;
    for (const payment of overdue) {
      if (!payment.expireIfOverdue(now)) continue;
      try {
        await this.payments.save(payment);
        await this.eventBus.publishAll(payment.pullDomainEvents());
        expired += 1;
      } catch (error) {
        // A concurrent webhook may have settled it in the meantime – skip.
        if (!(error instanceof DomainException && error.code === 'CONFLICT')) throw error;
      }
    }
    return expired;
  }

  async findById(paymentId: string): Promise<Payment | null> {
    return this.payments.findById(paymentId);
  }

  private async findReplay(
    command: ProcessPaymentCommand,
    amount: Money,
  ): Promise<Result<Payment> | null> {
    const existing = await this.payments.findByIdempotencyKey(command.idempotencyKey);
    if (!existing) return null;
    if (!existing.matches({ orderId: command.orderId, amount })) {
      return err(
        DomainError.conflict('Idempotency key already used for a different payment', {
          idempotencyKey: command.idempotencyKey,
        }),
      );
    }
    this.logger.log(
      `Idempotent replay for key ${command.idempotencyKey} -> payment ${existing.id}`,
    );
    return ok(existing);
  }

  private async executeStrategy(payment: Payment): Promise<StrategyOutcome> {
    try {
      return await this.strategies.resolve(payment.method.type).execute(payment);
    } catch (error) {
      // Simplification: treat provider errors as declines. A production system would
      // keep the payment in an UNKNOWN state and reconcile with the provider.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Provider error for payment ${payment.id}: ${message}`);
      return { status: 'DECLINED', reason: 'Payment provider unavailable' };
    }
  }

  private applyOutcome(payment: Payment, outcome: StrategyOutcome): Result<void> {
    switch (outcome.status) {
      case 'APPROVED':
        return payment.approve(outcome.providerReference);
      case 'PENDING':
        return payment.awaitPayer(
          outcome.providerReference,
          outcome.instructions,
          outcome.expiresAt,
        );
      case 'DECLINED':
        return payment.decline(outcome.reason);
    }
  }
}

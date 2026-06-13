import {
  AggregateBaseProps,
  AggregateRoot,
  DomainError,
  err,
  Money,
  ok,
  okVoid,
  Result,
} from '../../../../shared/domain';
import {
  PaymentApprovedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
} from '../events/payment.events';
import { PaymentMethod } from '../value-objects/payment-method.vo';

export enum PaymentStatus {
  /** Created, or waiting for the payer (PIX QR code / boleto not paid yet). */
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Declined = 'DECLINED',
  Expired = 'EXPIRED',
  Refunded = 'REFUNDED',
}

export interface PaymentProps {
  orderId: string;
  customerId: string;
  amount: Money;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotencyKey: string;
  providerReference: string | null;
  declineReason: string | null;
  /** Payer instructions (PIX copy-and-paste code, boleto digitable line...). */
  instructions: Record<string, string> | null;
  expiresAt: Date | null;
  refundedAt: Date | null;
}

export interface InitiatePaymentInput {
  orderId: string;
  customerId: string;
  amount: Money;
  method: PaymentMethod;
  idempotencyKey: string;
}

export class Payment extends AggregateRoot {
  private constructor(
    private props: PaymentProps,
    base?: AggregateBaseProps,
  ) {
    super(base);
  }

  static initiate(input: InitiatePaymentInput): Result<Payment> {
    if (input.amount.isZero) {
      return err(DomainError.validation('Payment amount must be greater than zero'));
    }
    if (!input.idempotencyKey || input.idempotencyKey.length > 128) {
      return err(DomainError.validation('A valid idempotency key is required'));
    }
    return ok(
      new Payment({
        ...input,
        status: PaymentStatus.Pending,
        providerReference: null,
        declineReason: null,
        instructions: null,
        expiresAt: null,
        refundedAt: null,
      }),
    );
  }

  static reconstitute(props: PaymentProps, base: AggregateBaseProps): Payment {
    return new Payment({ ...props }, base);
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get method(): PaymentMethod {
    return this.props.method;
  }

  get status(): PaymentStatus {
    return this.props.status;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get providerReference(): string | null {
    return this.props.providerReference;
  }

  get declineReason(): string | null {
    return this.props.declineReason;
  }

  get instructions(): Record<string, string> | null {
    return this.props.instructions;
  }

  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }

  get refundedAt(): Date | null {
    return this.props.refundedAt;
  }

  get isSettled(): boolean {
    return this.props.status !== PaymentStatus.Pending;
  }

  /** Provider accepted the charge but the payer still has to act (PIX/boleto). */
  awaitPayer(
    providerReference: string,
    instructions: Record<string, string>,
    expiresAt: Date,
  ): Result<void> {
    if (this.props.status !== PaymentStatus.Pending) {
      return err(DomainError.invalidState(`Payment ${this.id} is already ${this.props.status}`));
    }
    this.props.providerReference = providerReference;
    this.props.instructions = instructions;
    this.props.expiresAt = expiresAt;
    this.touch();
    return okVoid();
  }

  approve(providerReference: string): Result<void> {
    if (this.props.status === PaymentStatus.Approved) return okVoid(); // idempotent webhook replays
    if (this.props.status !== PaymentStatus.Pending) {
      return err(DomainError.invalidState(`Cannot approve a ${this.props.status} payment`));
    }
    this.props.status = PaymentStatus.Approved;
    this.props.providerReference = providerReference;
    this.touch();
    this.addDomainEvent(new PaymentApprovedEvent(this.id, this.eventPayload()));
    return okVoid();
  }

  decline(reason: string): Result<void> {
    if (this.props.status === PaymentStatus.Declined) return okVoid();
    if (this.props.status !== PaymentStatus.Pending) {
      return err(DomainError.invalidState(`Cannot decline a ${this.props.status} payment`));
    }
    this.props.status = PaymentStatus.Declined;
    this.props.declineReason = reason;
    this.touch();
    this.addDomainEvent(new PaymentFailedEvent(this.id, { ...this.eventPayload(), reason }));
    return okVoid();
  }

  expireIfOverdue(now: Date = new Date()): boolean {
    if (this.props.status !== PaymentStatus.Pending || !this.props.expiresAt) return false;
    if (this.props.expiresAt.getTime() > now.getTime()) return false;

    this.props.status = PaymentStatus.Expired;
    this.props.declineReason = 'Payment window expired';
    this.touch();
    this.addDomainEvent(
      new PaymentFailedEvent(this.id, { ...this.eventPayload(), reason: 'expired' }),
    );
    return true;
  }

  refund(now: Date = new Date()): Result<void> {
    if (this.props.status === PaymentStatus.Refunded) return okVoid();
    if (this.props.status !== PaymentStatus.Approved) {
      return err(
        DomainError.invalidState(
          `Only approved payments can be refunded (current: ${this.props.status})`,
        ),
      );
    }
    this.props.status = PaymentStatus.Refunded;
    this.props.refundedAt = now;
    this.touch();
    this.addDomainEvent(new PaymentRefundedEvent(this.id, this.eventPayload()));
    return okVoid();
  }

  /** Same idempotency key must describe the same charge. */
  matches(input: Pick<InitiatePaymentInput, 'orderId' | 'amount'>): boolean {
    return this.props.orderId === input.orderId && this.props.amount.equals(input.amount);
  }

  private eventPayload() {
    return {
      orderId: this.props.orderId,
      amountInCents: this.props.amount.amountInCents,
      currency: this.props.amount.currency,
      method: this.props.method.type,
    };
  }
}

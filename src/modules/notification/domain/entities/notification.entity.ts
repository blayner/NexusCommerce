import {
  DomainError,
  Entity,
  EntityBaseProps,
  err,
  ok,
  okVoid,
  Result,
} from '../../../../shared/domain';

export enum NotificationChannelType {
  Email = 'EMAIL',
  Sms = 'SMS',
  Push = 'PUSH',
}

export enum NotificationStatus {
  Queued = 'QUEUED',
  Sent = 'SENT',
  Failed = 'FAILED',
}

export type TemplateData = Record<string, string | number>;

export interface NotificationProps {
  channel: NotificationChannelType;
  recipient: string;
  template: string;
  payload: TemplateData;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  /** Business-level dedup key, e.g. "order.order.paid:<orderId>:EMAIL". */
  dedupKey: string | null;
  sentAt: Date | null;
}

export class Notification extends Entity {
  private constructor(
    private props: NotificationProps,
    base?: EntityBaseProps,
  ) {
    super(base);
  }

  static create(input: {
    channel: NotificationChannelType;
    recipient: string;
    template: string;
    payload: TemplateData;
    dedupKey?: string | null;
  }): Result<Notification> {
    if (!input.recipient?.trim()) return err(DomainError.validation('Recipient is required'));
    if (!input.template?.trim()) return err(DomainError.validation('Template is required'));

    return ok(
      new Notification({
        channel: input.channel,
        recipient: input.recipient.trim(),
        template: input.template,
        payload: { ...input.payload },
        status: NotificationStatus.Queued,
        attempts: 0,
        lastError: null,
        providerMessageId: null,
        dedupKey: input.dedupKey ?? null,
        sentAt: null,
      }),
    );
  }

  static reconstitute(props: NotificationProps, base: EntityBaseProps): Notification {
    return new Notification({ ...props }, base);
  }

  get channel(): NotificationChannelType {
    return this.props.channel;
  }

  get recipient(): string {
    return this.props.recipient;
  }

  get template(): string {
    return this.props.template;
  }

  get payload(): TemplateData {
    return this.props.payload;
  }

  get status(): NotificationStatus {
    return this.props.status;
  }

  get attempts(): number {
    return this.props.attempts;
  }

  get lastError(): string | null {
    return this.props.lastError;
  }

  get providerMessageId(): string | null {
    return this.props.providerMessageId;
  }

  get dedupKey(): string | null {
    return this.props.dedupKey;
  }

  get sentAt(): Date | null {
    return this.props.sentAt;
  }

  get isDelivered(): boolean {
    return this.props.status === NotificationStatus.Sent;
  }

  registerAttempt(): void {
    this.props.attempts += 1;
    this.touch();
  }

  markSent(providerMessageId: string, now: Date = new Date()): Result<void> {
    if (this.props.status === NotificationStatus.Sent) {
      return err(DomainError.invalidState('Notification already sent'));
    }
    this.props.status = NotificationStatus.Sent;
    this.props.providerMessageId = providerMessageId;
    this.props.sentAt = now;
    this.props.lastError = null;
    this.touch();
    return okVoid();
  }

  /** `permanent` = retries exhausted (or the error is not retryable). */
  markFailed(error: string, permanent: boolean): void {
    this.props.lastError = error.slice(0, 500);
    if (permanent) this.props.status = NotificationStatus.Failed;
    this.touch();
  }
}

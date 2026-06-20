import { NotificationChannelType } from '../entities/notification.entity';

export interface RenderedMessage {
  recipient: string;
  subject: string;
  body: string;
}

export interface DeliveryReceipt {
  providerMessageId: string;
}

/** Thrown for failures that retrying will not fix (invalid address, blocked number...). */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}

export interface NotificationChannel {
  readonly type: NotificationChannelType;
  isValidRecipient(recipient: string): boolean;
  send(message: RenderedMessage): Promise<DeliveryReceipt>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

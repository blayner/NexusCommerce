import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationChannelType } from '../entities/notification.entity';
import {
  DeliveryReceipt,
  NotificationChannel,
  PermanentDeliveryError,
  RenderedMessage,
} from './notification-channel.interface';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Development e-mail provider: logs the message instead of calling SMTP/SES/SendGrid.
 * Swapping providers means writing another NotificationChannel – nothing else changes.
 */
export class EmailChannel implements NotificationChannel {
  readonly type = NotificationChannelType.Email;
  private readonly logger = new Logger(EmailChannel.name);

  isValidRecipient(recipient: string): boolean {
    return EMAIL.test(recipient);
  }

  async send(message: RenderedMessage): Promise<DeliveryReceipt> {
    if (!this.isValidRecipient(message.recipient)) {
      throw new PermanentDeliveryError(`Invalid e-mail address: ${message.recipient}`);
    }
    this.logger.log(`[email] to=${message.recipient} subject="${message.subject}"`);
    return { providerMessageId: `email_${randomUUID()}` };
  }
}

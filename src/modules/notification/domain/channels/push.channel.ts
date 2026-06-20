import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationChannelType } from '../entities/notification.entity';
import {
  DeliveryReceipt,
  NotificationChannel,
  PermanentDeliveryError,
  RenderedMessage,
} from './notification-channel.interface';

const DEVICE_TOKEN = /^[A-Za-z0-9:_-]{32,256}$/;

/** Development push provider (FCM/APNs would be called here). */
export class PushChannel implements NotificationChannel {
  readonly type = NotificationChannelType.Push;
  private readonly logger = new Logger(PushChannel.name);

  isValidRecipient(recipient: string): boolean {
    return DEVICE_TOKEN.test(recipient);
  }

  async send(message: RenderedMessage): Promise<DeliveryReceipt> {
    if (!this.isValidRecipient(message.recipient)) {
      throw new PermanentDeliveryError('Invalid device token');
    }
    this.logger.log(`[push] device=${message.recipient.slice(0, 8)}… title="${message.subject}"`);
    return { providerMessageId: `push_${randomUUID()}` };
  }
}

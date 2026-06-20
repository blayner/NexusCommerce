import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationChannelType } from '../entities/notification.entity';
import {
  DeliveryReceipt,
  NotificationChannel,
  PermanentDeliveryError,
  RenderedMessage,
} from './notification-channel.interface';

const E164 = /^\+[1-9]\d{7,14}$/;
const GSM_SEGMENT = 160;
const MAX_SEGMENTS = 3;

/** Development SMS provider. Enforces E.164 numbers and a segment budget per message. */
export class SmsChannel implements NotificationChannel {
  readonly type = NotificationChannelType.Sms;
  private readonly logger = new Logger(SmsChannel.name);

  isValidRecipient(recipient: string): boolean {
    return E164.test(recipient);
  }

  async send(message: RenderedMessage): Promise<DeliveryReceipt> {
    if (!this.isValidRecipient(message.recipient)) {
      throw new PermanentDeliveryError(
        `Phone number must be in E.164 format: ${message.recipient}`,
      );
    }
    const text = SmsChannel.truncate(message.body);
    this.logger.log(`[sms] to=${message.recipient} segments=${SmsChannel.segments(text)}`);
    return { providerMessageId: `sms_${randomUUID()}` };
  }

  static segments(text: string): number {
    return Math.max(1, Math.ceil(text.length / GSM_SEGMENT));
  }

  static truncate(text: string): string {
    const limit = GSM_SEGMENT * MAX_SEGMENTS;
    return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
  }
}

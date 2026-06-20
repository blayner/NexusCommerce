import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  NOTIFICATION_QUEUE_PORT,
  NOTIFICATIONS_QUEUE,
} from './application/ports/notification-queue.port';
import { NotificationProcessor } from './application/processors/notification.processor';
import { NotificationService } from './application/services/notification.service';
import { EmailChannel } from './domain/channels/email.channel';
import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from './domain/channels/notification-channel.interface';
import { PushChannel } from './domain/channels/push.channel';
import { SmsChannel } from './domain/channels/sms.channel';
import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository.port';
import { BullNotificationQueue } from './infrastructure/adapters/bull-notification.queue';
import { PrismaNotificationRepository } from './infrastructure/adapters/notification.repository.adapter';

/**
 * Pure subscriber module: it has no inbound dependencies from other modules and reacts
 * to their events, so it could be moved to its own service without touching callers.
 */
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  providers: [
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    { provide: NOTIFICATION_QUEUE_PORT, useClass: BullNotificationQueue },
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (): NotificationChannel[] => [
        new EmailChannel(),
        new SmsChannel(),
        new PushChannel(),
      ],
    },
    NotificationService,
    NotificationProcessor,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}

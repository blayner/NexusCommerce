import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  DELIVER_NOTIFICATION_JOB,
  DeliverNotificationJob,
  NOTIFICATIONS_QUEUE,
  NotificationQueuePort,
} from '../../application/ports/notification-queue.port';

@Injectable()
export class BullNotificationQueue implements NotificationQueuePort {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<DeliverNotificationJob>,
  ) {}

  async enqueue(job: DeliverNotificationJob): Promise<void> {
    await this.queue.add(DELIVER_NOTIFICATION_JOB, job, {
      jobId: job.notificationId, // BullMQ ignores duplicates with the same id
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 24 * 3600, count: 5_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }
}

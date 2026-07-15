import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DeliverNotificationJob, NOTIFICATIONS_QUEUE } from '../ports/notification-queue.port';
import { DeliveryOutcome, NotificationService } from '../services/notification.service';

/**
 * BullMQ worker for the notifications queue. Concurrency is bounded so a provider
 * outage cannot exhaust the process; retries/backoff come from the job options.
 */
@Processor(NOTIFICATIONS_QUEUE, { concurrency: 10 })
export class NotificationProcessor extends WorkerHost {
  constructor(private readonly notifications: NotificationService) {
    super();
  }

  process(job: Job<DeliverNotificationJob>): Promise<DeliveryOutcome> {
    const maxAttempts = job.opts.attempts ?? 1;
    return this.notifications.deliver(job.data.notificationId, job.attemptsMade + 1, maxAttempts);
  }
}

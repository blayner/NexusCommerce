import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PaymentService } from '../../application/services/payment.service';

export const PAYMENT_MAINTENANCE_QUEUE = 'payment-maintenance';
const EXPIRE_JOB = 'expire-overdue-payments';

/**
 * Repeatable job that expires unpaid PIX/boleto charges. BullMQ guarantees a single
 * execution per tick across all app instances (the repeat key is shared in Redis),
 * which a plain setInterval in a horizontally scaled deployment would not.
 */
@Processor(PAYMENT_MAINTENANCE_QUEUE)
export class PaymentExpirationProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentExpirationProcessor.name);

  constructor(
    private readonly payments: PaymentService,
    @InjectQueue(PAYMENT_MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      EXPIRE_JOB,
      {},
      { repeat: { every: 60_000 }, jobId: EXPIRE_JOB, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  async process(job: Job): Promise<number> {
    if (job.name !== EXPIRE_JOB) return 0;
    const expired = await this.payments.expireOverduePayments();
    if (expired > 0) this.logger.log(`Expired ${expired} overdue payment(s)`);
    return expired;
  }
}

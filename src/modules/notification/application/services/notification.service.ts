import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../../../shared/application/event-bus';
import { DomainError, err, Money, ok, Result, isCurrency } from '../../../../shared/domain';
import {
  OrderCancelledEvent,
  OrderPaidEvent,
  OrderPlacedEvent,
  OrderShippedEvent,
} from '../../../order';
import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
  PermanentDeliveryError,
} from '../../domain/channels/notification-channel.interface';
import { Notification, NotificationChannelType } from '../../domain/entities/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  NotificationRepositoryPort,
} from '../../domain/repositories/notification.repository.port';
import { SendNotificationCommand } from '../commands/send-notification.command';
import { NOTIFICATION_QUEUE_PORT, NotificationQueuePort } from '../ports/notification-queue.port';
import { renderTemplate, requiredVariables } from '../templates/notification-templates';

export type DeliveryOutcome = 'SENT' | 'ALREADY_SENT' | 'FAILED_PERMANENTLY';

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private readonly channels: ReadonlyMap<NotificationChannelType, NotificationChannel>;
  private readonly subscriptions: Array<() => void> = [];

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepositoryPort,
    @Inject(NOTIFICATION_QUEUE_PORT) private readonly queue: NotificationQueuePort,
    @Inject(NOTIFICATION_CHANNELS) channels: NotificationChannel[],
    private readonly eventBus: EventBus,
  ) {
    this.channels = new Map(channels.map((channel) => [channel.type, channel]));
  }

  onModuleInit(): void {
    this.subscriptions.push(
      this.eventBus.subscribe<OrderPlacedEvent>(OrderPlacedEvent.EVENT_NAME, (event) =>
        this.notifyOrder(
          event.aggregateId,
          event.payload.customerEmail,
          'order-placed',
          OrderPlacedEvent.EVENT_NAME,
          {
            itemCount: event.payload.itemCount,
            total: formatMoney(event.payload.totalInCents, event.payload.currency),
          },
        ),
      ),
      this.eventBus.subscribe<OrderPaidEvent>(OrderPaidEvent.EVENT_NAME, (event) =>
        this.notifyOrder(
          event.aggregateId,
          event.payload.customerEmail,
          'order-paid',
          OrderPaidEvent.EVENT_NAME,
          {
            total: formatMoney(event.payload.totalInCents, event.payload.currency),
          },
        ),
      ),
      this.eventBus.subscribe<OrderShippedEvent>(OrderShippedEvent.EVENT_NAME, (event) =>
        this.notifyOrder(
          event.aggregateId,
          event.payload.customerEmail,
          'order-shipped',
          OrderShippedEvent.EVENT_NAME,
          {
            trackingCode: event.payload.trackingCode,
          },
        ),
      ),
      this.eventBus.subscribe<OrderCancelledEvent>(OrderCancelledEvent.EVENT_NAME, (event) =>
        this.notifyOrder(
          event.aggregateId,
          event.payload.customerEmail,
          'order-cancelled',
          OrderCancelledEvent.EVENT_NAME,
          {
            reason: event.payload.reason,
          },
        ),
      ),
    );
  }

  onModuleDestroy(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
  }

  /** Validates, persists and enqueues. Delivery happens asynchronously in the worker. */
  async send(command: SendNotificationCommand): Promise<Result<Notification>> {
    const channel = this.channels.get(command.channel);
    if (!channel)
      return err(DomainError.validation(`Channel ${command.channel} is not configured`));
    if (!channel.isValidRecipient(command.recipient)) {
      return err(
        DomainError.validation(`Invalid ${command.channel} recipient`, {
          recipient: command.recipient,
        }),
      );
    }

    const missing = requiredVariables(command.template).filter(
      (name) => command.data[name] === undefined,
    );
    if (missing.length > 0) {
      return err(DomainError.validation(`Missing template variables: ${missing.join(', ')}`));
    }

    if (command.dedupKey) {
      const existing = await this.notifications.findByDedupKey(command.dedupKey);
      if (existing) return ok(existing);
    }

    const created = Notification.create({
      channel: command.channel,
      recipient: command.recipient,
      template: command.template,
      payload: command.data,
      dedupKey: command.dedupKey,
    });
    if (!created.ok) return created;

    await this.notifications.save(created.value);
    await this.queue.enqueue({ notificationId: created.value.id });
    return created;
  }

  /**
   * Executed by the BullMQ worker. Throws on retryable failures so BullMQ applies its
   * exponential backoff; permanent failures are recorded and swallowed.
   */
  async deliver(
    notificationId: string,
    attempt: number,
    maxAttempts: number,
  ): Promise<DeliveryOutcome> {
    const notification = await this.notifications.findById(notificationId);
    if (!notification) throw new Error(`Notification ${notificationId} not found`);
    if (notification.isDelivered) return 'ALREADY_SENT'; // job re-delivered after a crash

    const channel = this.channels.get(notification.channel);
    if (!channel) throw new Error(`Channel ${notification.channel} is not configured`);

    notification.registerAttempt();
    try {
      const rendered = renderTemplate(
        notification.template as Parameters<typeof renderTemplate>[0],
        notification.payload,
      );
      const receipt = await channel.send({ recipient: notification.recipient, ...rendered });
      notification.markSent(receipt.providerMessageId);
      await this.notifications.save(notification);
      return 'SENT';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = error instanceof PermanentDeliveryError || attempt >= maxAttempts;
      notification.markFailed(message, permanent);
      await this.notifications.save(notification);

      if (error instanceof PermanentDeliveryError) {
        this.logger.warn(`Notification ${notificationId} failed permanently: ${message}`);
        return 'FAILED_PERMANENTLY';
      }
      throw error;
    }
  }

  private async notifyOrder(
    orderId: string,
    email: string,
    template: SendNotificationCommand['template'],
    eventName: string,
    data: Record<string, string | number>,
  ): Promise<void> {
    const result = await this.send(
      new SendNotificationCommand(
        NotificationChannelType.Email,
        email,
        template,
        { orderNumber: orderId.slice(0, 8).toUpperCase(), ...data },
        `${eventName}:${orderId}:EMAIL`,
      ),
    );
    if (!result.ok) {
      this.logger.warn(
        `Could not queue "${template}" for order ${orderId}: ${result.error.message}`,
      );
    }
  }
}

function formatMoney(amountInCents: number, currency: string): string {
  return Money.of(amountInCents, isCurrency(currency) ? currency : 'BRL').format();
}

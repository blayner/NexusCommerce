import { EventBus } from '../../../src/shared/application/event-bus';
import { SendNotificationCommand } from '../../../src/modules/notification/application/commands/send-notification.command';
import {
  DeliverNotificationJob,
  NotificationQueuePort,
} from '../../../src/modules/notification/application/ports/notification-queue.port';
import { NotificationService } from '../../../src/modules/notification/application/services/notification.service';
import { renderTemplate } from '../../../src/modules/notification/application/templates/notification-templates';
import { EmailChannel } from '../../../src/modules/notification/domain/channels/email.channel';
import { SmsChannel } from '../../../src/modules/notification/domain/channels/sms.channel';
import {
  NotificationChannelType,
  NotificationStatus,
} from '../../../src/modules/notification/domain/entities/notification.entity';
import { InMemoryNotificationRepository } from '../../../src/modules/notification/infrastructure/adapters/in-memory-notification.repository';
import { OrderPaidEvent } from '../../../src/modules/order/domain/events/order.events';

class RecordingQueue implements NotificationQueuePort {
  readonly jobs: DeliverNotificationJob[] = [];
  async enqueue(job: DeliverNotificationJob): Promise<void> {
    this.jobs.push(job);
  }
}

describe('NotificationService', () => {
  let repository: InMemoryNotificationRepository;
  let queue: RecordingQueue;
  let eventBus: EventBus;
  let email: EmailChannel;
  let service: NotificationService;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    queue = new RecordingQueue();
    eventBus = new EventBus();
    email = new EmailChannel();
    service = new NotificationService(repository, queue, [email, new SmsChannel()], eventBus);
    service.onModuleInit();
  });

  afterEach(() => service.onModuleDestroy());

  const shipped = () =>
    new SendNotificationCommand(
      NotificationChannelType.Email,
      'ana@example.com',
      'order-shipped',
      {
        orderNumber: 'AB12CD34',
        trackingCode: 'BR123456789BR',
      },
      'shipped:1',
    );

  it('persists and enqueues instead of sending inline', async () => {
    const result = await service.send(shipped());
    expect(result.ok).toBe(true);
    expect(queue.jobs).toHaveLength(1);
    expect(repository.all()[0].status).toBe(NotificationStatus.Queued);
  });

  it('deduplicates by key', async () => {
    await service.send(shipped());
    await service.send(shipped());
    expect(queue.jobs).toHaveLength(1);
  });

  it('validates recipients and template variables up-front', async () => {
    const badEmail = await service.send(
      new SendNotificationCommand(
        NotificationChannelType.Email,
        'not-an-email',
        'order-cancelled',
        {
          orderNumber: '1',
          reason: 'x',
        },
      ),
    );
    expect(badEmail.ok).toBe(false);

    const missingVar = await service.send(
      new SendNotificationCommand(
        NotificationChannelType.Email,
        'ana@example.com',
        'order-shipped',
        { orderNumber: '1' },
      ),
    );
    expect(!missingVar.ok && missingVar.error.message).toContain('trackingCode');

    const unconfigured = await service.send(
      new SendNotificationCommand(NotificationChannelType.Push, 'x'.repeat(40), 'order-cancelled', {
        orderNumber: '1',
        reason: 'x',
      }),
    );
    expect(unconfigured.ok).toBe(false);
  });

  it('delivers once even if the job runs twice', async () => {
    const sent = await service.send(shipped());
    if (!sent.ok) throw new Error('setup failed');
    const spy = jest.spyOn(email, 'send');

    expect(await service.deliver(sent.value.id, 1, 5)).toBe('SENT');
    expect(await service.deliver(sent.value.id, 2, 5)).toBe('ALREADY_SENT');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rethrows transient errors so BullMQ retries, and gives up on the last attempt', async () => {
    const sent = await service.send(shipped());
    if (!sent.ok) throw new Error('setup failed');
    jest.spyOn(email, 'send').mockRejectedValue(new Error('SMTP timeout'));

    await expect(service.deliver(sent.value.id, 1, 3)).rejects.toThrow('SMTP timeout');
    expect((await repository.findById(sent.value.id))?.status).toBe(NotificationStatus.Queued);

    await expect(service.deliver(sent.value.id, 3, 3)).rejects.toThrow('SMTP timeout');
    const final = await repository.findById(sent.value.id);
    expect(final?.status).toBe(NotificationStatus.Failed);
    expect(final?.attempts).toBe(2);
  });

  it('sends an e-mail when an order is paid', async () => {
    await eventBus.publish(
      new OrderPaidEvent('0f8fad5b-d9cb-469f-a165-70867728950e', {
        customerId: 'c-1',
        customerEmail: 'ana@example.com',
        paymentId: 'pay-1',
        totalInCents: 12_345,
        currency: 'BRL',
      }),
    );

    const [notification] = repository.all();
    expect(notification.template).toBe('order-paid');
    expect(notification.payload.orderNumber).toBe('0F8FAD5B');
    expect(String(notification.payload.total)).toMatch(/123,45/);
  });

  it('renders templates strictly', () => {
    expect(
      renderTemplate('order-cancelled', { orderNumber: '42', reason: 'Sem estoque' }).body,
    ).toContain('Sem estoque');
    expect(() => renderTemplate('order-cancelled', { orderNumber: '42' })).toThrow('reason');
  });
});

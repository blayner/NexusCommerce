import { NotificationChannelType, TemplateData } from '../../domain/entities/notification.entity';
import { TemplateKey } from '../templates/notification-templates';

export class SendNotificationCommand {
  constructor(
    public readonly channel: NotificationChannelType,
    public readonly recipient: string,
    public readonly template: TemplateKey,
    public readonly data: TemplateData,
    /** Same key => same notification; protects against duplicate events/retries. */
    public readonly dedupKey?: string,
  ) {}
}

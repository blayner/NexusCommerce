import { Notification } from '../../domain/entities/notification.entity';
import { NotificationRepositoryPort } from '../../domain/repositories/notification.repository.port';

export class InMemoryNotificationRepository implements NotificationRepositoryPort {
  private readonly notifications = new Map<string, Notification>();

  async findById(id: string): Promise<Notification | null> {
    return this.notifications.get(id) ?? null;
  }

  async findByDedupKey(dedupKey: string): Promise<Notification | null> {
    return [...this.notifications.values()].find((n) => n.dedupKey === dedupKey) ?? null;
  }

  async save(notification: Notification): Promise<void> {
    this.notifications.set(notification.id, notification);
  }

  all(): Notification[] {
    return [...this.notifications.values()];
  }
}

import { Notification } from '../entities/notification.entity';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface NotificationRepositoryPort {
  findById(id: string): Promise<Notification | null>;
  findByDedupKey(dedupKey: string): Promise<Notification | null>;
  save(notification: Notification): Promise<void>;
}

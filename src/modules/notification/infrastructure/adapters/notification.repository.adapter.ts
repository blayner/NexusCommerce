import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  Notification,
  NotificationChannelType,
  NotificationStatus,
  TemplateData,
} from '../../domain/entities/notification.entity';
import { NotificationRepositoryPort } from '../../domain/repositories/notification.repository.port';

interface NotificationRecord {
  id: string;
  channel: string;
  recipient: string;
  template: string;
  payload: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  dedupKey: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function notificationToDomain(record: NotificationRecord): Notification {
  return Notification.reconstitute(
    {
      channel: record.channel as NotificationChannelType,
      recipient: record.recipient,
      template: record.template,
      payload: record.payload as TemplateData,
      status: record.status as NotificationStatus,
      attempts: record.attempts,
      lastError: record.lastError,
      providerMessageId: record.providerMessageId,
      dedupKey: record.dedupKey,
      sentAt: record.sentAt,
    },
    { id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt },
  );
}

@Injectable()
export class PrismaNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Notification | null> {
    const record = await this.prisma.notification.findUnique({ where: { id } });
    return record ? notificationToDomain(record) : null;
  }

  async findByDedupKey(dedupKey: string): Promise<Notification | null> {
    const record = await this.prisma.notification.findUnique({ where: { dedupKey } });
    return record ? notificationToDomain(record) : null;
  }

  async save(notification: Notification): Promise<void> {
    const data = {
      channel: notification.channel,
      recipient: notification.recipient,
      template: notification.template,
      payload: notification.payload as Prisma.InputJsonValue,
      status: notification.status,
      attempts: notification.attempts,
      lastError: notification.lastError,
      providerMessageId: notification.providerMessageId,
      dedupKey: notification.dedupKey,
      sentAt: notification.sentAt,
    };
    await this.prisma.notification.upsert({
      where: { id: notification.id },
      create: { id: notification.id, ...data },
      update: data,
    });
  }
}

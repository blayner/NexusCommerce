import { Injectable } from '@nestjs/common';
import { paginate, Paginated, PageRequest } from '../../../../shared/application/pagination';
import { DomainError, DomainException } from '../../../../shared/domain';
import { Prisma, PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Order } from '../../domain/entities/order.entity';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { OrderMapper } from '../mappers/order.mapper';

const WITH_ITEMS = { items: true } as const;

@Injectable()
export class PrismaOrderRepository implements OrderRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({ where: { id }, include: WITH_ITEMS });
    return record ? OrderMapper.toDomain(record, record.items) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: WITH_ITEMS,
    });
    return record ? OrderMapper.toDomain(record, record.items) : null;
  }

  async findByPaymentId(paymentId: string): Promise<Order | null> {
    const record = await this.prisma.order.findFirst({ where: { paymentId }, include: WITH_ITEMS });
    return record ? OrderMapper.toDomain(record, record.items) : null;
  }

  async findByCustomer(customerId: string, page: PageRequest): Promise<Paginated<Order>> {
    const where = { customerId };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: WITH_ITEMS,
        orderBy: { createdAt: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
    ]);
    return paginate(
      records.map((record) => OrderMapper.toDomain(record, record.items)),
      total,
      page,
    );
  }

  /** Lines are immutable: written once on insert; afterwards only the header changes. */
  async save(order: Order): Promise<void> {
    const { version: _v, createdAt: _c, history, ...data } = OrderMapper.toRecord(order);
    const historyJson = history as Prisma.InputJsonValue;

    if (order.isNew) {
      await this.prisma.order.create({
        data: {
          ...data,
          history: historyJson,
          version: 1,
          items: {
            create: OrderMapper.toItemRecords(order).map(({ orderId: _orderId, ...item }) => item),
          },
        },
      });
    } else {
      const { id, ...changes } = data;
      const result = await this.prisma.order.updateMany({
        where: { id, version: order.version },
        data: { ...changes, history: historyJson, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new DomainException(DomainError.conflict(`Order ${id} was modified concurrently`));
      }
    }
    order.markPersisted();
  }
}

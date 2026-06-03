import { paginate, Paginated, PageRequest } from '../../../../shared/application/pagination';
import { DomainError, DomainException } from '../../../../shared/domain';
import { Order } from '../../domain/entities/order.entity';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { OrderItemRecord, OrderMapper, OrderRecord } from '../mappers/order.mapper';

export class InMemoryOrderRepository implements OrderRepositoryPort {
  private readonly records = new Map<string, { order: OrderRecord; items: OrderItemRecord[] }>();

  async findById(id: string): Promise<Order | null> {
    return this.load(this.records.get(id));
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    return this.load(
      [...this.records.values()].find((entry) => entry.order.idempotencyKey === key),
    );
  }

  async findByPaymentId(paymentId: string): Promise<Order | null> {
    return this.load(
      [...this.records.values()].find((entry) => entry.order.paymentId === paymentId),
    );
  }

  async findByCustomer(customerId: string, page: PageRequest): Promise<Paginated<Order>> {
    const all = [...this.records.values()]
      .filter((entry) => entry.order.customerId === customerId)
      .sort((a, b) => b.order.createdAt.getTime() - a.order.createdAt.getTime());
    const start = (page.page - 1) * page.pageSize;
    const items = all.slice(start, start + page.pageSize).map((entry) => this.load(entry)!);
    return paginate(items, all.length, page);
  }

  async save(order: Order): Promise<void> {
    const stored = this.records.get(order.id);
    if ((stored?.order.version ?? 0) !== order.version) {
      throw new DomainException(
        DomainError.conflict(`Order ${order.id} was modified concurrently`),
      );
    }
    order.markPersisted();
    this.records.set(order.id, {
      order: OrderMapper.toRecord(order),
      items: stored?.items ?? OrderMapper.toItemRecords(order),
    });
  }

  private load(entry: { order: OrderRecord; items: OrderItemRecord[] } | undefined): Order | null {
    if (!entry) return null;
    const copy = structuredClone(entry);
    return OrderMapper.toDomain(copy.order, copy.items);
  }
}

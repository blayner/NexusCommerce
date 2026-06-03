import { Paginated, PageRequest } from '../../../../shared/application/pagination';
import { Order } from '../entities/order.entity';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface OrderRepositoryPort {
  findById(id: string): Promise<Order | null>;
  findByIdempotencyKey(key: string): Promise<Order | null>;
  findByPaymentId(paymentId: string): Promise<Order | null>;
  findByCustomer(customerId: string, page: PageRequest): Promise<Paginated<Order>>;
  /** Optimistic concurrency on `version` (throws DomainException CONFLICT). */
  save(order: Order): Promise<void>;
}

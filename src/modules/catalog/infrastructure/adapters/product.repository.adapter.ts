import { Injectable } from '@nestjs/common';
import { paginate, Paginated } from '../../../../shared/application/pagination';
import { DomainError, DomainException } from '../../../../shared/domain';
import {
  Prisma,
  PrismaService,
  PrismaTx,
} from '../../../../shared/infrastructure/prisma/prisma.service';
import { Product } from '../../domain/entities/product.entity';
import {
  ProductRepositoryPort,
  ProductSearchCriteria,
} from '../../domain/repositories/product.repository.port';
import { ProductMapper } from '../mappers/product.mapper';

const ORDER_BY: Record<
  NonNullable<ProductSearchCriteria['sort']>,
  Prisma.ProductOrderByWithRelationInput
> = {
  newest: { createdAt: 'desc' },
  price_asc: { priceInCents: 'asc' },
  price_desc: { priceInCents: 'desc' },
  name: { name: 'asc' },
};

@Injectable()
export class PrismaProductRepository implements ProductRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({ where: { id } });
    return record ? ProductMapper.toDomain(record) : null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({ where: { sku } });
    return record ? ProductMapper.toDomain(record) : null;
  }

  async findManyByIds(ids: readonly string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const records = await this.prisma.product.findMany({ where: { id: { in: [...ids] } } });
    return records.map((record) => ProductMapper.toDomain(record));
  }

  async search(criteria: ProductSearchCriteria): Promise<Paginated<Product>> {
    const where = this.buildWhere(criteria);
    const [total, records] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [ORDER_BY[criteria.sort ?? 'newest'], { id: 'asc' }],
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
    ]);
    return paginate(
      records.map((record) => ProductMapper.toDomain(record)),
      total,
      criteria,
    );
  }

  async save(product: Product): Promise<void> {
    await this.persist(this.prisma, product);
    product.markPersisted();
  }

  async saveMany(products: readonly Product[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const product of products) {
        await this.persist(tx, product);
      }
    });
    products.forEach((product) => product.markPersisted());
  }

  /**
   * Insert for new aggregates; otherwise a conditional update on `version`.
   * Zero affected rows means someone else wrote first -> CONFLICT (caller may retry).
   */
  private async persist(client: PrismaService | PrismaTx, product: Product): Promise<void> {
    const { version: _version, createdAt: _createdAt, ...data } = ProductMapper.toRecord(product);

    if (product.isNew) {
      await client.product.create({ data: { ...data, version: 1 } });
      return;
    }

    const { id, ...changes } = data;
    const result = await client.product.updateMany({
      where: { id, version: product.version },
      data: { ...changes, version: { increment: 1 } },
    });

    if (result.count === 0) {
      throw new DomainException(
        DomainError.conflict(`Product ${id} was modified concurrently`, {
          expectedVersion: product.version,
        }),
      );
    }
  }

  private buildWhere(criteria: ProductSearchCriteria): Prisma.ProductWhereInput {
    const and: Prisma.ProductWhereInput[] = [];

    if (!criteria.includeInactive) and.push({ active: true });
    if (criteria.text) {
      and.push({
        OR: [
          { name: { contains: criteria.text, mode: 'insensitive' } },
          { sku: { contains: criteria.text.toUpperCase() } },
          { description: { contains: criteria.text, mode: 'insensitive' } },
        ],
      });
    }
    if (criteria.categoryId) and.push({ categoryId: criteria.categoryId });
    if (criteria.minPriceInCents !== undefined)
      and.push({ priceInCents: { gte: criteria.minPriceInCents } });
    if (criteria.maxPriceInCents !== undefined)
      and.push({ priceInCents: { lte: criteria.maxPriceInCents } });
    if (criteria.inStockOnly) {
      // Column-to-column comparison (Prisma field references).
      and.push({ stockOnHand: { gt: this.prisma.product.fields.stockReserved } });
    }

    return { AND: and };
  }
}

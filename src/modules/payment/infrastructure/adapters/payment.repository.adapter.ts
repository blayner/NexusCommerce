import { Injectable } from '@nestjs/common';
import { DomainError, DomainException } from '../../../../shared/domain';
import { Prisma, PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Payment, PaymentStatus } from '../../domain/entities/payment.entity';
import { PaymentRepositoryPort } from '../../domain/repositories/payment.repository.port';
import { PaymentMapper } from '../mappers/payment.mapper';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaPaymentRepository implements PaymentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { id } });
    return record ? PaymentMapper.toDomain(record) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    return record ? PaymentMapper.toDomain(record) : null;
  }

  async findByProviderReference(providerReference: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { providerReference } });
    return record ? PaymentMapper.toDomain(record) : null;
  }

  async findOverduePending(now: Date, limit: number): Promise<Payment[]> {
    const records = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.Pending, expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    return records.map((record) => PaymentMapper.toDomain(record));
  }

  async save(payment: Payment): Promise<void> {
    const {
      version: _v,
      createdAt: _c,
      methodDetails,
      instructions,
      ...data
    } = PaymentMapper.toRecord(payment);
    const json = {
      methodDetails: methodDetails as Prisma.InputJsonValue,
      instructions: instructions === null ? Prisma.DbNull : (instructions as Prisma.InputJsonValue),
    };

    try {
      if (payment.isNew) {
        await this.prisma.payment.create({ data: { ...data, ...json, version: 1 } });
      } else {
        const { id, ...changes } = data;
        const result = await this.prisma.payment.updateMany({
          where: { id, version: payment.version },
          data: { ...changes, ...json, version: { increment: 1 } },
        });
        if (result.count === 0) {
          throw new DomainException(
            DomainError.conflict(`Payment ${id} was modified concurrently`),
          );
        }
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new DomainException(
          DomainError.conflict('Duplicate payment idempotency key or provider reference'),
        );
      }
      throw error;
    }
    payment.markPersisted();
  }
}

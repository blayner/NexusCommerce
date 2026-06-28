import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Category } from '../../domain/entities/category.entity';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { CategoryMapper } from '../mappers/product.mapper';

@Injectable()
export class PrismaCategoryRepository implements CategoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Category | null> {
    const record = await this.prisma.category.findUnique({ where: { id } });
    return record ? CategoryMapper.toDomain(record) : null;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    const record = await this.prisma.category.findUnique({ where: { slug } });
    return record ? CategoryMapper.toDomain(record) : null;
  }

  async findAll(): Promise<Category[]> {
    const records = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return records.map((record) => CategoryMapper.toDomain(record));
  }

  async save(category: Category): Promise<void> {
    const { id, createdAt: _createdAt, ...data } = CategoryMapper.toRecord(category);
    await this.prisma.category.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
}

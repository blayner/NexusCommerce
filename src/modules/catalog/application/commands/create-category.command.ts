import { Inject, Injectable } from '@nestjs/common';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { Category } from '../../domain/entities/category.entity';
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from '../../domain/repositories/category.repository.port';

export class CreateCategoryCommand {
  constructor(
    public readonly name: string,
    public readonly parentId: string | null = null,
  ) {}
}

@Injectable()
export class CreateCategoryHandler {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepositoryPort) {}

  async execute(command: CreateCategoryCommand): Promise<Result<Category>> {
    if (command.parentId && !(await this.categories.findById(command.parentId))) {
      return err(DomainError.notFound('Category', command.parentId));
    }

    const created = Category.create(command.name, command.parentId);
    if (!created.ok) return created;

    if (await this.categories.findBySlug(created.value.slug)) {
      return err(DomainError.conflict(`Category "${created.value.slug}" already exists`));
    }

    await this.categories.save(created.value);
    return ok(created.value);
  }
}

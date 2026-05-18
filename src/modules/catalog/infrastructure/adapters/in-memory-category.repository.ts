import { Category } from '../../domain/entities/category.entity';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';

export class InMemoryCategoryRepository implements CategoryRepositoryPort {
  private readonly categories = new Map<string, Category>();

  async findById(id: string): Promise<Category | null> {
    return this.categories.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return [...this.categories.values()].find((category) => category.slug === slug) ?? null;
  }

  async findAll(): Promise<Category[]> {
    return [...this.categories.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(category: Category): Promise<void> {
    this.categories.set(category.id, category);
  }
}

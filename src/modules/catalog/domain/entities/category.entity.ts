import { DomainError, Entity, EntityBaseProps, err, ok, Result } from '../../../../shared/domain';

export interface CategoryProps {
  name: string;
  slug: string;
  parentId: string | null;
}

export class Category extends Entity {
  private constructor(
    private readonly props: CategoryProps,
    base?: EntityBaseProps,
  ) {
    super(base);
  }

  static create(name: string, parentId: string | null = null): Result<Category> {
    const trimmed = name?.trim() ?? '';
    if (trimmed.length < 2 || trimmed.length > 60) {
      return err(DomainError.validation('Category name must have between 2 and 60 characters'));
    }
    const slug = Category.slugify(trimmed);
    if (!slug) {
      return err(DomainError.validation('Category name must contain letters or numbers'));
    }
    return ok(new Category({ name: trimmed, slug, parentId }));
  }

  static reconstitute(props: CategoryProps, base: EntityBaseProps): Category {
    return new Category(props, base);
  }

  /** "Eletrônicos & Informática" -> "eletronicos-informatica" */
  static slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get parentId(): string | null {
    return this.props.parentId;
  }

  get isRoot(): boolean {
    return this.props.parentId === null;
  }
}

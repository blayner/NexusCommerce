import { randomUUID } from 'crypto';

export interface EntityBaseProps {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Object with a stable identity across its lifecycle.
 */
export abstract class Entity {
  public readonly id: string;
  public readonly createdAt: Date;
  private _updatedAt: Date;

  protected constructor(base: EntityBaseProps = {}) {
    this.id = base.id ?? randomUUID();
    this.createdAt = base.createdAt ?? new Date();
    this._updatedAt = base.updatedAt ?? this.createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected touch(): void {
    this._updatedAt = new Date();
  }

  equals(other?: Entity | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    return other.constructor === this.constructor && other.id === this.id;
  }
}

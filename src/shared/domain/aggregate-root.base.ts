import { DomainEvent } from './domain-event';
import { Entity, EntityBaseProps } from './entity.base';

export interface AggregateBaseProps extends EntityBaseProps {
  version?: number;
}

/**
 * Consistency boundary. Records domain events raised by state changes and carries an
 * optimistic-concurrency version that repositories compare on every write.
 */
export abstract class AggregateRoot extends Entity {
  private readonly _domainEvents: DomainEvent[] = [];
  private _version: number;

  protected constructor(base: AggregateBaseProps = {}) {
    super(base);
    this._version = base.version ?? 0;
  }

  /** Version as last read from (or written to) the store. 0 means "never persisted". */
  get version(): number {
    return this._version;
  }

  get isNew(): boolean {
    return this._version === 0;
  }

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  /** Called by repositories after a successful write. */
  markPersisted(): void {
    this._version += 1;
  }

  /** Returns and clears pending events – call once the aggregate has been persisted. */
  pullDomainEvents(): DomainEvent[] {
    return this._domainEvents.splice(0, this._domainEvents.length);
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }
}

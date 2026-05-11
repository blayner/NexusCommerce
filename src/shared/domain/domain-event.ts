import { randomUUID } from 'crypto';

/**
 * Something meaningful that happened inside an aggregate.
 *
 * Every concrete event exposes a static `EVENT_NAME` (namespaced as `<module>.<aggregate>.<fact>`)
 * so subscribers in other modules can listen without importing internal classes.
 */
export abstract class DomainEvent<TPayload extends object = object> {
  public readonly eventId: string = randomUUID();
  public readonly occurredAt: Date = new Date();
  abstract readonly eventName: string;

  protected constructor(
    public readonly aggregateId: string,
    public readonly payload: TPayload,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventName: this.eventName,
      aggregateId: this.aggregateId,
      occurredAt: this.occurredAt.toISOString(),
      payload: this.payload,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '../domain/domain-event';

export type DomainEventHandler<E extends DomainEvent = DomainEvent> = (
  event: E,
) => Promise<void> | void;

/**
 * In-process publish/subscribe bus used for communication between modules.
 *
 * Modules never call each other's internals in reaction to facts; they subscribe to
 * namespaced event names instead. Handler failures are isolated and logged so a broken
 * subscriber (e.g. notifications) cannot fail the transaction that raised the event.
 *
 * See docs/adr/0003-in-process-domain-events.md for the trade-offs and the outbox follow-up.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  subscribe<E extends DomainEvent>(eventName: string, handler: DomainEventHandler<E>): () => void {
    const list = this.handlers.get(eventName) ?? [];
    const erased = handler as DomainEventHandler;
    list.push(erased);
    this.handlers.set(eventName, list);

    return () => {
      const current = this.handlers.get(eventName) ?? [];
      this.handlers.set(
        eventName,
        current.filter((registered) => registered !== erased),
      );
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName) ?? [];
    if (handlers.length === 0) return;

    const results = await Promise.allSettled(handlers.map(async (handler) => handler(event)));

    results.forEach((result) => {
      if (result.status === 'rejected') {
        const reason =
          result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        this.logger.error(
          `Handler for "${event.eventName}" (event ${event.eventId}) failed: ${reason.message}`,
          reason.stack,
        );
      }
    });
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}

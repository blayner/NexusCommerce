import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../application/event-bus';
import { DomainEvent } from '../../domain/domain-event';
import { OrderTransition, PrometheusAppMetrics } from './prometheus-app-metrics';

/**
 * Counts order lifecycle transitions by listening to the order module's domain events.
 *
 * Subscribing by namespaced event name (instead of importing the order module's classes)
 * keeps the dependency pointing from infrastructure to a published contract, and keeps
 * the Order aggregate free of metrics code. Events are emitted only after the aggregate
 * is persisted, so a counted transition is a transition that really happened.
 */
export const ORDER_TRANSITION_EVENTS: Readonly<Record<string, OrderTransition>> = {
  'order.order.placed': 'placed',
  'order.order.paid': 'paid',
  'order.order.shipped': 'shipped',
  'order.order.delivered': 'delivered',
  'order.order.cancelled': 'cancelled',
};

@Injectable()
export class OrderMetricsSubscriber implements OnModuleInit, OnModuleDestroy {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly eventBus: EventBus,
    private readonly metrics: PrometheusAppMetrics,
  ) {}

  onModuleInit(): void {
    this.unsubscribers = Object.entries(ORDER_TRANSITION_EVENTS).map(([eventName, transition]) =>
      this.eventBus.subscribe(eventName, (event: DomainEvent) => this.record(transition, event)),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  private record(transition: OrderTransition, event: DomainEvent): void {
    this.metrics.orderTransition(transition);
    if (transition === 'cancelled') {
      const previous = (event.payload as { previousStatus?: unknown }).previousStatus;
      this.metrics.orderCancelled(typeof previous === 'string' ? previous : 'UNKNOWN');
    }
  }
}

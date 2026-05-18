import { DomainEvent } from '../../../../shared/domain';

export class ProductCreatedEvent extends DomainEvent<{ sku: string; name: string }> {
  static readonly EVENT_NAME = 'catalog.product.created';
  readonly eventName = ProductCreatedEvent.EVENT_NAME;

  constructor(productId: string, payload: { sku: string; name: string }) {
    super(productId, payload);
  }
}

export class ProductPriceChangedEvent extends DomainEvent<{
  sku: string;
  previousPriceInCents: number;
  newPriceInCents: number;
}> {
  static readonly EVENT_NAME = 'catalog.product.price-changed';
  readonly eventName = ProductPriceChangedEvent.EVENT_NAME;

  constructor(
    productId: string,
    payload: { sku: string; previousPriceInCents: number; newPriceInCents: number },
  ) {
    super(productId, payload);
  }
}

export class StockDepletedEvent extends DomainEvent<{ sku: string }> {
  static readonly EVENT_NAME = 'catalog.product.stock-depleted';
  readonly eventName = StockDepletedEvent.EVENT_NAME;

  constructor(productId: string, payload: { sku: string }) {
    super(productId, payload);
  }
}

export class StockReplenishedEvent extends DomainEvent<{ sku: string; availableStock: number }> {
  static readonly EVENT_NAME = 'catalog.product.stock-replenished';
  readonly eventName = StockReplenishedEvent.EVENT_NAME;

  constructor(productId: string, payload: { sku: string; availableStock: number }) {
    super(productId, payload);
  }
}

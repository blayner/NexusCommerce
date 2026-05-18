/**
 * Public API of the catalog module. Other modules must import from here only.
 */
export { CatalogModule } from './catalog.module';
export { CatalogService } from './application/services/catalog.service';
export type { ProductSnapshot, StockLine } from './application/services/catalog.service';
export {
  ProductCreatedEvent,
  ProductPriceChangedEvent,
  StockDepletedEvent,
  StockReplenishedEvent,
} from './domain/events/product.events';

import { EventBus } from '../../../src/shared/application/event-bus';
import { InMemoryCacheService } from '../../../src/shared/infrastructure/cache/in-memory-cache.service';
import { CatalogCache } from '../../../src/modules/catalog/application/catalog-cache';
import { CatalogService } from '../../../src/modules/catalog/application/services/catalog.service';
import {
  GetProductHandler,
  GetProductQuery,
} from '../../../src/modules/catalog/application/queries/get-product.query';
import { Product } from '../../../src/modules/catalog/domain/entities/product.entity';
import { StockDepletedEvent } from '../../../src/modules/catalog/domain/events/product.events';
import { InMemoryProductRepository } from '../../../src/modules/catalog/infrastructure/adapters/in-memory-product.repository';

describe('CatalogService (stock facade)', () => {
  let repository: InMemoryProductRepository;
  let eventBus: EventBus;
  let cache: InMemoryCacheService;
  let service: CatalogService;
  let keyboard: Product;
  let mouse: Product;

  const seed = async (name: string, sku: string, stock: number) => {
    const created = Product.create({ name, sku, priceInCents: 10_000, initialStock: stock });
    if (!created.ok) throw new Error(created.error.message);
    await repository.save(created.value);
    return created.value;
  };

  beforeEach(async () => {
    repository = new InMemoryProductRepository();
    eventBus = new EventBus();
    cache = new InMemoryCacheService();
    service = new CatalogService(repository, eventBus, new CatalogCache(cache));
    keyboard = await seed('Keyboard', 'KB-1', 5);
    mouse = await seed('Mouse', 'MS-1', 1);
  });

  it('reserves all lines atomically', async () => {
    const result = await service.reserveStock([
      { productId: keyboard.id, quantity: 2 },
      { productId: mouse.id, quantity: 1 },
    ]);

    expect(result.ok).toBe(true);
    expect((await repository.findById(keyboard.id))!.availableStock).toBe(3);
    expect((await repository.findById(mouse.id))!.availableStock).toBe(0);
  });

  it('reserves nothing when any line is short (all-or-nothing)', async () => {
    const result = await service.reserveStock([
      { productId: keyboard.id, quantity: 2 },
      { productId: mouse.id, quantity: 2 },
    ]);

    expect(result.ok).toBe(false);
    expect((await repository.findById(keyboard.id))!.stockReserved).toBe(0);
    expect((await repository.findById(mouse.id))!.stockReserved).toBe(0);
  });

  it('merges duplicate lines before validating', async () => {
    const result = await service.reserveStock([
      { productId: keyboard.id, quantity: 3 },
      { productId: keyboard.id, quantity: 3 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('fails with NOT_FOUND for unknown products', async () => {
    const result = await service.reserveStock([{ productId: 'missing', quantity: 1 }]);
    expect(!result.ok && result.error.code).toBe('NOT_FOUND');
  });

  it('publishes domain events after persisting', async () => {
    const handler = jest.fn();
    eventBus.subscribe(StockDepletedEvent.EVENT_NAME, handler);
    await service.reserveStock([{ productId: mouse.id, quantity: 1 }]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('retries on optimistic-lock conflicts', async () => {
    const original = repository.saveMany.bind(repository);
    let calls = 0;
    jest.spyOn(repository, 'saveMany').mockImplementation(async (products) => {
      calls += 1;
      if (calls === 1) repository.bumpVersion(keyboard.id); // concurrent writer
      return original(products);
    });

    const result = await service.reserveStock([{ productId: keyboard.id, quantity: 1 }]);
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('invalidates the cached product page on stock changes', async () => {
    const getProduct = new GetProductHandler(repository, new CatalogCache(cache));
    const before = await getProduct.execute(new GetProductQuery(keyboard.id));
    expect(before.ok && before.value.availableStock).toBe(5);

    await service.reserveStock([{ productId: keyboard.id, quantity: 2 }]);

    const after = await getProduct.execute(new GetProductQuery(keyboard.id));
    expect(after.ok && after.value.availableStock).toBe(3);
  });
});

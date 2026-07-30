import { Product } from '../../../src/modules/catalog/domain/entities/product.entity';
import {
  ProductCreatedEvent,
  StockDepletedEvent,
  StockReplenishedEvent,
} from '../../../src/modules/catalog/domain/events/product.events';
import { Category } from '../../../src/modules/catalog/domain/entities/category.entity';

function product(initialStock = 10): Product {
  const created = Product.create({
    name: 'Mechanical Keyboard',
    sku: 'kb-mx-brown',
    priceInCents: 45_900,
    initialStock,
  });
  if (!created.ok) throw new Error(created.error.message);
  created.value.pullDomainEvents();
  return created.value;
}

describe('Product aggregate', () => {
  it('normalizes the SKU and raises ProductCreated', () => {
    const created = Product.create({ name: 'Mouse Pad XL', sku: ' pad-xl ', priceInCents: 9_900 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.sku.value).toBe('PAD-XL');
    expect(created.value.pullDomainEvents()[0]).toBeInstanceOf(ProductCreatedEvent);
  });

  it.each([
    [{ name: 'ab', sku: 'SKU-1', priceInCents: 100 }, 'name'],
    [{ name: 'Valid name', sku: 'bad sku!', priceInCents: 100 }, 'SKU'],
    [{ name: 'Valid name', sku: 'SKU-1', priceInCents: 0 }, 'Price'],
    [
      { name: 'Valid name', sku: 'SKU-1', priceInCents: 1000, compareAtPriceInCents: 900 },
      'Compare-at',
    ],
  ])('rejects invalid input %#', (input, message) => {
    const created = Product.create(input);
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.message).toContain(message);
  });

  it('reserves, commits and keeps reserved <= on hand', () => {
    const p = product(5);
    expect(p.reserve(3).ok).toBe(true);
    expect(p.availableStock).toBe(2);
    expect(p.commitReservation(3).ok).toBe(true);
    expect(p.stockOnHand).toBe(2);
    expect(p.stockReserved).toBe(0);
  });

  it('refuses to oversell', () => {
    const p = product(2);
    const result = p.reserve(3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUSINESS_RULE');
      expect(result.error.details).toMatchObject({ requested: 3, available: 2 });
    }
    expect(p.stockReserved).toBe(0);
  });

  it('raises depleted / replenished events at the zero boundary', () => {
    const p = product(2);
    p.reserve(2);
    expect(p.pullDomainEvents()[0]).toBeInstanceOf(StockDepletedEvent);
    p.releaseReservation(1);
    expect(p.pullDomainEvents()[0]).toBeInstanceOf(StockReplenishedEvent);
  });

  it('cannot adjust stock below reserved units', () => {
    const p = product(10);
    p.reserve(4);
    expect(p.adjustStockOnHand(3).ok).toBe(false);
    expect(p.adjustStockOnHand(4).ok).toBe(true);
  });

  it('does not reserve inactive products', () => {
    const p = product(10);
    p.deactivate();
    expect(p.reserve(1).ok).toBe(false);
  });
});

describe('Category', () => {
  it('slugifies names with accents and symbols', () => {
    expect(Category.slugify('Eletrônicos & Informática')).toBe('eletronicos-informatica');
  });
});

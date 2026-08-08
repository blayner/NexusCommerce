import request from 'supertest';
import {
  adminToken,
  createProduct,
  createTestApp,
  customerToken,
  resetState,
  TestContext,
} from './utils/test-app';

describe('Catalog (e2e)', () => {
  let ctx: TestContext;
  let admin: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetState(ctx);
    admin = await adminToken(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('admins create products; anyone can read them', async () => {
    const product = await createProduct(ctx, admin, { sku: 'mon-34-uw', priceInCents: 199_900 });
    expect(product.sku).toBe('MON-34-UW');

    const res = await request(ctx.app.getHttpServer())
      .get(ctx.api(`/products/${product.id}`))
      .expect(200);
    expect(res.body).toMatchObject({
      sku: 'MON-34-UW',
      inStock: true,
      price: { amountInCents: 199_900 },
    });
  });

  it('customers cannot create products', async () => {
    const { token } = await customerToken(ctx);
    await request(ctx.app.getHttpServer())
      .post(ctx.api('/products'))
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hack', sku: 'HACK-1', priceInCents: 100 })
      .expect(403);
  });

  it('rejects anonymous writes and malformed payloads', async () => {
    await request(ctx.app.getHttpServer()).post(ctx.api('/products')).send({}).expect(401);
    await request(ctx.app.getHttpServer())
      .post(ctx.api('/products'))
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'x', sku: 'S', priceInCents: -1, extra: true })
      .expect(400);
  });

  it('returns 409 for duplicated SKUs', async () => {
    await createProduct(ctx, admin, { sku: 'DUP-1' });
    await request(ctx.app.getHttpServer())
      .post(ctx.api('/products'))
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Another one', sku: 'dup-1', priceInCents: 1_000 })
      .expect(409);
  });

  it('searches with filters, sorting and pagination', async () => {
    await createProduct(ctx, admin, { name: 'Teclado Mecânico', priceInCents: 45_000 });
    await createProduct(ctx, admin, { name: 'Teclado Membrana', priceInCents: 9_900 });
    await createProduct(ctx, admin, { name: 'Mouse Gamer', priceInCents: 19_900, initialStock: 0 });

    const res = await request(ctx.app.getHttpServer())
      .get(ctx.api('/products'))
      .query({ q: 'teclado', sort: 'price_asc', pageSize: 10 })
      .expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual([
      'Teclado Membrana',
      'Teclado Mecânico',
    ]);

    const inStock = await request(ctx.app.getHttpServer())
      .get(ctx.api('/products'))
      .query({ inStock: true })
      .expect(200);
    expect(inStock.body.items.every((p: { inStock: boolean }) => p.inStock)).toBe(true);
  });

  it('serves fresh data after a stock update (cache invalidation)', async () => {
    const product = await createProduct(ctx, admin, { initialStock: 2 });
    await request(ctx.app.getHttpServer())
      .get(ctx.api(`/products/${product.id}`))
      .expect(200); // warm cache

    await request(ctx.app.getHttpServer())
      .patch(ctx.api(`/products/${product.id}/stock`))
      .set('Authorization', `Bearer ${admin}`)
      .send({ operation: 'RESTOCK', quantity: 8 })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .get(ctx.api(`/products/${product.id}`))
      .expect(200);
    expect(res.body.availableStock).toBe(10);
  });
});

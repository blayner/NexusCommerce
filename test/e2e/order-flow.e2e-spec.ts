import request from 'supertest';
import { signPayload } from '../../src/modules/payment/infrastructure/webhook-signature';
import {
  adminToken,
  createProduct,
  createTestApp,
  customerToken,
  resetState,
  TestContext,
} from './utils/test-app';

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret';

describe('Order flow (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let customer: string;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function fillCart(productId: string, quantity: number) {
    await http()
      .post(ctx.api('/cart/items'))
      .set(auth(customer))
      .send({ productId, quantity })
      .expect(201);
  }

  async function stockOf(productId: string): Promise<number> {
    const res = await http()
      .get(ctx.api(`/products/${productId}`))
      .expect(200);
    return res.body.availableStock as number;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetState(ctx);
    admin = await adminToken(ctx);
    customer = (await customerToken(ctx)).token;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('cart -> card checkout -> PAID -> shipped -> delivered', async () => {
    const product = await createProduct(ctx, admin, { priceInCents: 150_000, initialStock: 3 });
    await fillCart(product.id, 2);

    const cart = await http().get(ctx.api('/cart')).set(auth(customer)).expect(200);
    expect(cart.body).toMatchObject({
      subtotalInCents: 300_000,
      shippingInCents: 0,
      totalInCents: 300_000,
    });

    const placed = await http()
      .post(ctx.api('/orders'))
      .set(auth(customer))
      .set('Idempotency-Key', 'checkout-e2e-0001')
      .send({ paymentMethod: { type: 'CREDIT_CARD', cardToken: 'tok_visa_4242', installments: 3 } })
      .expect(201);

    expect(placed.body.status).toBe('PAID');
    expect(await stockOf(product.id)).toBe(1);

    const emptyCart = await http().get(ctx.api('/cart')).set(auth(customer)).expect(200);
    expect(emptyCart.body.items).toHaveLength(0);

    // Same Idempotency-Key -> same order, no second charge
    const replay = await http()
      .post(ctx.api('/orders'))
      .set(auth(customer))
      .set('Idempotency-Key', 'checkout-e2e-0001')
      .send({ paymentMethod: { type: 'CREDIT_CARD', cardToken: 'tok_visa_4242', installments: 3 } })
      .expect(201);
    expect(replay.body.id).toBe(placed.body.id);

    await http()
      .patch(ctx.api(`/orders/${placed.body.id}/ship`))
      .set(auth(admin))
      .send({ trackingCode: 'BR123456789BR' })
      .expect(200);
    const delivered = await http()
      .patch(ctx.api(`/orders/${placed.body.id}/deliver`))
      .set(auth(admin))
      .expect(200);
    expect(delivered.body.status).toBe('DELIVERED');
    expect(delivered.body.history.map((h: { to: string }) => h.to)).toEqual([
      'DRAFT',
      'CONFIRMED',
      'PAYMENT_PENDING',
      'PAID',
      'SHIPPED',
      'DELIVERED',
    ]);
  });

  it('declined card cancels the order and releases the stock', async () => {
    const product = await createProduct(ctx, admin, { initialStock: 2 });
    await fillCart(product.id, 2);

    const res = await http()
      .post(ctx.api('/orders'))
      .set(auth(customer))
      .send({ paymentMethod: { type: 'CREDIT_CARD', cardToken: 'tok_declined', installments: 1 } })
      .expect(422);

    expect(res.body.message).toContain('Payment declined');
    expect(await stockOf(product.id)).toBe(2);

    const order = await http()
      .get(ctx.api(`/orders/${res.body.details.orderId}`))
      .set(auth(customer))
      .expect(200);
    expect(order.body.status).toBe('CANCELLED');
  });

  it('PIX: pending until a signed webhook confirms the payment', async () => {
    const product = await createProduct(ctx, admin, { priceInCents: 10_000, initialStock: 5 });
    await fillCart(product.id, 1);

    const placed = await http()
      .post(ctx.api('/orders'))
      .set(auth(customer))
      .send({ paymentMethod: { type: 'PIX' } })
      .expect(201);
    expect(placed.body.status).toBe('PAYMENT_PENDING');
    expect(placed.body.payment.instructions.copyAndPaste).toMatch(/^000201/);
    expect(await stockOf(product.id)).toBe(4); // reserved

    const payment = await http()
      .get(ctx.api(`/payments/${placed.body.paymentId}`))
      .set(auth(customer))
      .expect(200);
    const body = JSON.stringify({
      providerReference: `pix_${payment.body.instructions.txid}`,
      status: 'APPROVED',
    });

    await http()
      .post(ctx.api('/payments/webhooks/provider'))
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', 'deadbeef')
      .send(body)
      .expect(401);

    await http()
      .post(ctx.api('/payments/webhooks/provider'))
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', signPayload(body, WEBHOOK_SECRET))
      .send(body)
      .expect(200);

    const order = await http()
      .get(ctx.api(`/orders/${placed.body.id}`))
      .set(auth(customer))
      .expect(200);
    expect(order.body.status).toBe('PAID');
  });

  it('cannot check out more than the available stock', async () => {
    const product = await createProduct(ctx, admin, { initialStock: 1 });
    await http()
      .post(ctx.api('/cart/items'))
      .set(auth(customer))
      .send({ productId: product.id, quantity: 2 })
      .expect(422);
  });

  it('customers only see their own orders', async () => {
    const product = await createProduct(ctx, admin);
    await fillCart(product.id, 1);
    const placed = await http()
      .post(ctx.api('/orders'))
      .set(auth(customer))
      .send({ paymentMethod: { type: 'CREDIT_CARD', cardToken: 'tok_visa_4242', installments: 1 } })
      .expect(201);

    const other = (await customerToken(ctx)).token;
    await http()
      .get(ctx.api(`/orders/${placed.body.id}`))
      .set(auth(other))
      .expect(404);
  });
});

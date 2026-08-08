import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { API_PREFIX, configureApp } from '../../../src/bootstrap';
import { REDIS_CLIENT } from '../../../src/shared/infrastructure/cache/redis.provider';
import { PrismaService } from '../../../src/shared/infrastructure/prisma/prisma.service';

/**
 * Boots the real application against the PostgreSQL/Redis provided by docker-compose
 * (locally) or by GitHub Actions service containers (CI).
 */
export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
  redis: Redis;
  api: (path: string) => string;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    rawBody: true,
    logger: ['error'],
  });
  configureApp(app);
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    redis: app.get<Redis>(REDIS_CLIENT),
    api: (path: string) => `/${API_PREFIX}${path}`,
  };
}

export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.prisma.$transaction([
    ctx.prisma.notification.deleteMany(),
    ctx.prisma.payment.deleteMany(),
    ctx.prisma.orderItem.deleteMany(),
    ctx.prisma.order.deleteMany(),
    ctx.prisma.product.deleteMany(),
    ctx.prisma.category.deleteMany(),
    ctx.prisma.user.deleteMany(),
  ]);
  await ctx.redis.flushdb();
}

export async function adminToken(ctx: TestContext): Promise<string> {
  const email = `admin-${randomUUID()}@nexus.test`;
  await ctx.prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      name: 'Admin',
      passwordHash: await hash('Admin1234', 4),
      role: 'ADMIN',
    },
  });
  const res = await request(ctx.app.getHttpServer())
    .post(ctx.api('/auth/login'))
    .send({ email, password: 'Admin1234' })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

export async function customerToken(ctx: TestContext): Promise<{ token: string; email: string }> {
  const email = `customer-${randomUUID()}@nexus.test`;
  const res = await request(ctx.app.getHttpServer())
    .post(ctx.api('/auth/register'))
    .send({ email, name: 'Ana Cliente', password: 'Secret123' })
    .expect(201);
  return { token: (res.body as { accessToken: string }).accessToken, email };
}

export async function createProduct(
  ctx: TestContext,
  token: string,
  overrides: Partial<{
    sku: string;
    priceInCents: number;
    initialStock: number;
    name: string;
  }> = {},
): Promise<{ id: string; sku: string }> {
  const res = await request(ctx.app.getHttpServer())
    .post(ctx.api('/products'))
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides.name ?? 'Monitor UltraWide 34',
      sku: overrides.sku ?? `MON-${randomUUID().slice(0, 6).toUpperCase()}`,
      priceInCents: overrides.priceInCents ?? 249_900,
      initialStock: overrides.initialStock ?? 5,
    })
    .expect(201);
  return res.body as { id: string; sku: string };
}

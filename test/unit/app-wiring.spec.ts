import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { CartService } from '../../src/modules/cart';
import { CatalogService } from '../../src/modules/catalog';
import { NOTIFICATIONS_QUEUE } from '../../src/modules/notification/application/ports/notification-queue.port';
import { OrderService } from '../../src/modules/order';
import { PaymentService } from '../../src/modules/payment';
import { PAYMENT_MAINTENANCE_QUEUE } from '../../src/modules/payment/infrastructure/jobs/payment-expiration.processor';
import { REDIS_CLIENT } from '../../src/shared/infrastructure/cache/redis.provider';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

/**
 * Compiles the real AppModule (without starting it) with external connections stubbed.
 * Catches DI mistakes – missing providers, broken module imports, circular deps – in the
 * unit suite, without needing PostgreSQL or Redis.
 */
describe('AppModule wiring', () => {
  it('resolves every module facade', async () => {
    const fakeQueue = { add: jest.fn(), close: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(REDIS_CLIENT)
      .useValue({ status: 'end', quit: jest.fn() })
      .overrideProvider(getQueueToken(NOTIFICATIONS_QUEUE))
      .useValue(fakeQueue)
      .overrideProvider(getQueueToken(PAYMENT_MAINTENANCE_QUEUE))
      .useValue(fakeQueue)
      .compile();

    expect(moduleRef.get(CatalogService)).toBeInstanceOf(CatalogService);
    expect(moduleRef.get(CartService)).toBeInstanceOf(CartService);
    expect(moduleRef.get(PaymentService)).toBeInstanceOf(PaymentService);
    expect(moduleRef.get(OrderService)).toBeInstanceOf(OrderService);

    await moduleRef.close();
  });
});

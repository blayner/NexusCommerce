import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseConfig } from '../../../config/database.config';
import { Prisma, PrismaClient } from '../../../generated/prisma/client';

export { Prisma };
export type PrismaTx = Prisma.TransactionClient;

/**
 * Prisma 7 client wired through the `pg` driver adapter (no Rust query engine binary),
 * which keeps container images smaller and plays well with connection poolers.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(databaseConfig.KEY) config: ConfigType<typeof databaseConfig>) {
    super({
      adapter: new PrismaPg({ connectionString: config.url }),
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

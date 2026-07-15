import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { databaseConfig } from '../../../config/database.config';

/**
 * Shared BullMQ connection. Each module registers its own queues with
 * `BullModule.registerQueue(...)` and owns its processors.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: ConfigType<typeof databaseConfig>) => ({
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        },
        prefix: 'nexus:queue',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: { count: 1_000 },
          removeOnFail: { count: 5_000 },
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}

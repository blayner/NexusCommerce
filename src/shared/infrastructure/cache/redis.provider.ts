import { Logger, Provider } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { databaseConfig } from '../../../config/database.config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [databaseConfig.KEY],
  useFactory: (config: ConfigType<typeof databaseConfig>): Redis => {
    const logger = new Logger('Redis');
    const client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    client.on('error', (error) => logger.warn(`Redis error: ${error.message}`));
    return client;
  },
};

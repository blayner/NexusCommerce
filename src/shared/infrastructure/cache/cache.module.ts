import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { RedisCacheService } from './redis-cache.service';
import { REDIS_CLIENT, redisProvider } from './redis.provider';

@Global()
@Module({
  providers: [redisProvider, { provide: CacheService, useClass: RedisCacheService }],
  exports: [REDIS_CLIENT, CacheService],
})
export class CacheModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}

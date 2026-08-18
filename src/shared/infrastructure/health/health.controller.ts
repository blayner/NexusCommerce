import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { Public } from '../../auth/decorators';
import { REDIS_CLIENT } from '../cache/redis.provider';
import { PrismaService } from '../prisma/prisma.service';

type ComponentStatus = 'up' | 'down';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is running. */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'up' };
  }

  /** Readiness: dependencies are reachable; used by Docker/Kubernetes health checks. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = database === 'up' && redis === 'up';
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: healthy ? 'up' : 'down', components: { database, redis } };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    return (await this.prisma.isHealthy()) ? 'up' : 'down';
  }

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      return (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}

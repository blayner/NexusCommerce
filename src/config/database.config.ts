import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? 'postgresql://nexus:nexus@localhost:5432/nexus_commerce',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  },
  cache: {
    defaultTtlSeconds: parseInt(process.env.CACHE_DEFAULT_TTL_SECONDS ?? '300', 10),
  },
}));

export type DatabaseConfig = ReturnType<typeof databaseConfig>;

import { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/**
 * HTTP-level configuration shared by `main.ts` and the e2e test harness, so tests
 * exercise exactly the same routing as production.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health/live', 'health/ready', 'metrics'] });
  app.enableShutdownHooks();
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? false });
  return app;
}

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` doesn't need a live database, so CI can run it without DATABASE_URL.
const DEFAULT_URL = 'postgresql://nexus:nexus@localhost:5432/nexus_commerce?schema=public';

/**
 * Prisma 7 CLI configuration: schema, migrations and the datasource URL used by
 * `migrate`/`generate`. Prisma no longer loads `.env` itself, hence `dotenv/config`.
 */
export default defineConfig({
  schema: 'src/shared/infrastructure/prisma/schema.prisma',
  migrations: {
    path: 'src/shared/infrastructure/prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? DEFAULT_URL,
  },
});

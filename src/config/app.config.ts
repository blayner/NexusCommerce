import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-to-a-long-random-string',
    expiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '3600', 10),
  },
  cart: {
    ttlSeconds: parseInt(process.env.CART_TTL_SECONDS ?? '604800', 10),
  },
  payments: {
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret',
    pix: {
      key: process.env.PIX_KEY ?? 'pagamentos@nexuscommerce.dev',
      merchantName: process.env.PIX_MERCHANT_NAME ?? 'NEXUS COMMERCE',
      merchantCity: process.env.PIX_MERCHANT_CITY ?? 'SAO PAULO',
    },
  },
}));

export type AppConfig = ReturnType<typeof appConfig>;

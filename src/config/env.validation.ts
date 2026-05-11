const INSECURE_SECRETS = new Set(['change-me-to-a-long-random-string', 'dev-webhook-secret']);

/**
 * Fails fast on boot when the environment is misconfigured. Development keeps
 * sensible defaults; production refuses to start with placeholder secrets.
 */
const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const env = asString(config.NODE_ENV, 'development');

  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push('PORT must be a valid TCP port');
  }

  if (env === 'production') {
    if (!config.DATABASE_URL) errors.push('DATABASE_URL is required in production');

    const jwtSecret = asString(config.JWT_SECRET);
    if (jwtSecret.length < 32 || INSECURE_SECRETS.has(jwtSecret)) {
      errors.push('JWT_SECRET must be at least 32 characters and not a placeholder in production');
    }

    const webhookSecret = asString(config.PAYMENT_WEBHOOK_SECRET);
    if (!webhookSecret || INSECURE_SECRETS.has(webhookSecret)) {
      errors.push('PAYMENT_WEBHOOK_SECRET must be set in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
  }
  return config;
}

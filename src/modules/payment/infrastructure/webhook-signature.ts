import { createHmac, timingSafeEqual } from 'crypto';

/** HMAC-SHA256 over the raw request body, hex encoded. */
export function signPayload(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** Constant-time comparison to avoid leaking signature bytes through timing. */
export function isValidSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(rawBody, secret), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

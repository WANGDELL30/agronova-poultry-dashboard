import { createHmac, timingSafeEqual } from 'node:crypto';

/** Value Meta puts in `X-Hub-Signature-256`: HMAC-SHA256 of the raw body, keyed by the app secret. */
export function signBody(rawBody: Buffer, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

/** Must run on the exact bytes received: re-serialised JSON does not produce the same digest. */
export function verifySignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header) return false;
  const expected = Buffer.from(signBody(rawBody, appSecret));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

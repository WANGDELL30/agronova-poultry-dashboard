import { resolve } from 'node:path';

export interface VisionConfig {
  inferenceUrl: string;
  inferenceTimeoutMs: number;
  /** Short timeout for GET /health, so a hung service is reported quickly (AUDIT R13). */
  inferenceHealthTimeoutMs: number;
  /** Optional shared secret sent as X-API-Key (needed when inference sits behind a public tunnel). */
  inferenceApiKey: string | null;
  imageDir: string;
  maxImageBytes: number;
}

export const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function positiveInt(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

/** Largest delay `setTimeout`/`AbortSignal.timeout` accept (2^31 - 1 ms, about 24.8 days). */
export const MAX_TIMER_MS = 2_147_483_647;

/**
 * Decimal digits only, 1..MAX_TIMER_MS. Larger values make Node fire the timer after 1 ms or throw
 * a RangeError, which turned every upload into a timeout (AUDIT H6).
 */
function timeoutMs(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(parsed >= 1 && parsed <= MAX_TIMER_MS)) {
    throw new Error(
      `${name} must be a whole number of milliseconds between 1 and ${MAX_TIMER_MS}; received "${value}".`,
    );
  }
  return parsed;
}

export function loadVisionConfig(env: NodeJS.ProcessEnv = process.env): VisionConfig {
  return {
    inferenceUrl: (env.INFERENCE_URL ?? 'http://localhost:8000').replace(/\/+$/, ''),
    inferenceTimeoutMs: timeoutMs('INFERENCE_TIMEOUT_MS', env.INFERENCE_TIMEOUT_MS, 30_000),
    inferenceHealthTimeoutMs: timeoutMs(
      'INFERENCE_HEALTH_TIMEOUT_MS',
      env.INFERENCE_HEALTH_TIMEOUT_MS,
      5_000,
    ),
    inferenceApiKey: env.INFERENCE_API_KEY || null,
    imageDir: resolve(env.VISION_IMAGE_DIR ?? './data/vision-images'),
    maxImageBytes: positiveInt(
      'VISION_MAX_IMAGE_BYTES',
      env.VISION_MAX_IMAGE_BYTES,
      8 * 1024 * 1024,
    ),
  };
}

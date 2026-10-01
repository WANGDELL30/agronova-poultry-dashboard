import { resolve } from 'node:path';

export interface VisionConfig {
  inferenceUrl: string;
  inferenceTimeoutMs: number;
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

export function loadVisionConfig(env: NodeJS.ProcessEnv = process.env): VisionConfig {
  return {
    inferenceUrl: (env.INFERENCE_URL ?? 'http://localhost:8000').replace(/\/+$/, ''),
    inferenceTimeoutMs: positiveInt('INFERENCE_TIMEOUT_MS', env.INFERENCE_TIMEOUT_MS, 30_000),
    inferenceApiKey: env.INFERENCE_API_KEY || null,
    imageDir: resolve(env.VISION_IMAGE_DIR ?? './data/vision-images'),
    maxImageBytes: positiveInt(
      'VISION_MAX_IMAGE_BYTES',
      env.VISION_MAX_IMAGE_BYTES,
      8 * 1024 * 1024,
    ),
  };
}

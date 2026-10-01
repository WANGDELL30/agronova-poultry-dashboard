import { ApiVisionClient } from './api-vision-client';
import { MockVisionClient } from './mock-vision-client';
import type { VisionClient } from './vision-client';

/** Mirrors the telemetry source switch: NEXT_PUBLIC_DATA_MODE=api uses the real API, otherwise mock. */
export function createVisionClient(
  env: Record<string, string | undefined> = process.env,
): VisionClient {
  if (env.NEXT_PUBLIC_DATA_MODE === 'api') {
    return new ApiVisionClient(env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000');
  }
  return new MockVisionClient();
}

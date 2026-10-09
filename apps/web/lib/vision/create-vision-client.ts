import { ApiVisionClient } from './api-vision-client';
import { MockVisionClient } from './mock-vision-client';
import type { VisionClient } from './vision-client';

/** NEXT_PUBLIC_DATA_MODE=api uses the real API, otherwise mock.
 *  Variables must be read as literal `process.env.NEXT_PUBLIC_*` so Next.js inlines them in the browser. */
export function createVisionClient(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  },
): VisionClient {
  if (env.NEXT_PUBLIC_DATA_MODE === 'api') {
    return new ApiVisionClient(env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000');
  }
  return new MockVisionClient();
}

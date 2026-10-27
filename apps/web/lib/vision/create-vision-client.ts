import { ApiVisionClient } from './api-vision-client';
import { MockVisionClient } from './mock-vision-client';
import type { VisionClient } from './vision-client';

/** Real API is the default. NEXT_PUBLIC_DATA_MODE=mock is an explicit development opt-in.
 *  Variables must be read as literal `process.env.NEXT_PUBLIC_*` so Next.js inlines them in the browser. */
export function createVisionClient(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
): VisionClient {
  if (env.NODE_ENV !== 'production' && env.NEXT_PUBLIC_DATA_MODE === 'mock') {
    return new MockVisionClient();
  }
  return new ApiVisionClient(env.NEXT_PUBLIC_API_BASE_URL ?? '');
}

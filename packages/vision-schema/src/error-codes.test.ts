import { describe, expect, it } from 'vitest';

import { VISION_API_ERROR_CODES } from './index.js';

describe('vision API error codes (AUDIT H16)', () => {
  it('lists every error code the API returns, without duplicates', () => {
    expect(VISION_API_ERROR_CODES).toEqual(
      expect.arrayContaining([
        'inference_unreachable',
        'inference_timeout',
        'inference_not_ready',
        'inference_bad_response',
        'invalid_metadata',
      ]),
    );
    expect(new Set(VISION_API_ERROR_CODES).size).toBe(VISION_API_ERROR_CODES.length);
  });
});

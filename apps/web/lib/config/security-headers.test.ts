import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { describe, expect, it } from 'vitest';

import config from '../../next.config';
import { securityHeaders } from './security-headers';

describe('security headers', () => {
  it('sets the minimal header set without a full CSP', () => {
    expect(Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]))).toEqual({
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });

  it('applies them to every route from next.config', async () => {
    const headers = await config(PHASE_PRODUCTION_SERVER).headers?.();
    expect(headers).toEqual([{ source: '/:path*', headers: securityHeaders }]);
  });
});

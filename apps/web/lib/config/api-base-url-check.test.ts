import { describe, expect, it } from 'vitest';

import { checkApiBaseUrl } from './api-base-url-check';

describe('checkApiBaseUrl', () => {
  it('fails a Vercel production build without an https API URL', () => {
    for (const url of [undefined, '', '  ', 'http://203.0.113.5:4000', 'api.example.com']) {
      expect(
        checkApiBaseUrl({ VERCEL_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: url }),
      ).toMatchObject({
        level: 'error',
        message: expect.stringContaining('NEXT_PUBLIC_API_BASE_URL'),
      });
    }
  });

  it('only warns outside Vercel production', () => {
    expect(checkApiBaseUrl({})).toMatchObject({ level: 'warn' });
    expect(checkApiBaseUrl({ VERCEL_ENV: 'preview' })).toMatchObject({ level: 'warn' });
    expect(checkApiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000' })).toMatchObject({
      level: 'warn',
    });
  });

  it('accepts an https API URL', () => {
    expect(
      checkApiBaseUrl({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_API_BASE_URL: 'https://api.example',
      }),
    ).toEqual({ level: 'ok' });
  });
});

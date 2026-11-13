import { describe, expect, it } from 'vitest';

import { parseAllowedOrigins } from './cors.js';

describe('parseAllowedOrigins (AUDIT S13, R15)', () => {
  it('defaults to the local web origin', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3000']);
  });

  it('trims entries and strips trailing slashes', () => {
    expect(parseAllowedOrigins(' http://localhost:3000/ , https://web.example//')).toEqual([
      'http://localhost:3000',
      'https://web.example',
    ]);
  });

  it('fails fast on an empty list', () => {
    for (const value of ['', '  ', ', ,']) {
      expect(() => parseAllowedOrigins(value)).toThrow(/WEB_ORIGIN/);
    }
  });

  it('fails fast on a wildcard anywhere in the list', () => {
    for (const value of ['*', 'http://localhost:3000,*', ' * ']) {
      expect(() => parseAllowedOrigins(value)).toThrow(/WEB_ORIGIN.*\*/);
    }
  });
});

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { parseTrustProxy } from './trust-proxy.js';

describe('parseTrustProxy (AUDIT D17)', () => {
  it('trusts no proxy when unset or blank', () => {
    for (const value of [undefined, '', '  ', ' , ']) {
      expect(parseTrustProxy(value)).toBe(false);
    }
  });

  it('accepts IPv4/IPv6 addresses and CIDR ranges, trimmed', () => {
    expect(parseTrustProxy(' 127.0.0.1 , ::1, 10.0.0.0/8 ,fd00::/8')).toEqual([
      '127.0.0.1',
      '::1',
      '10.0.0.0/8',
      'fd00::/8',
    ]);
  });

  it('refuses values that would trust every client', () => {
    for (const value of [
      'true',
      '*',
      '1',
      'localhost',
      '127.0.0.1/33',
      '::1/129',
      '1.2.3.4/8/9',
      '10.0.0.0/',
    ]) {
      expect(() => parseTrustProxy(value)).toThrow(/API_TRUST_PROXY/);
    }
  });
});

describe('request.ip behind a trusted local proxy', () => {
  const ipFor = async (trustProxy: string[] | false) => {
    const app = Fastify({ trustProxy });
    app.get('/', async (request) => ({ ip: request.ip }));
    const res = await app.inject({
      method: 'GET',
      url: '/',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    await app.close();
    return res.json().ip;
  };

  it('uses X-Forwarded-For only when the proxy is trusted', async () => {
    expect(await ipFor(parseTrustProxy('127.0.0.1,::1'))).toBe('203.0.113.7');
    expect(await ipFor(parseTrustProxy(undefined))).toBe('127.0.0.1');
  });
});

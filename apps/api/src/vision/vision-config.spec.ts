import { describe, expect, it } from 'vitest';

import { loadVisionConfig } from './vision-config.js';

describe('loadVisionConfig INFERENCE_TIMEOUT_MS (AUDIT H6)', () => {
  const load = (value: string | undefined) =>
    loadVisionConfig({ INFERENCE_TIMEOUT_MS: value }).inferenceTimeoutMs;

  it('defaults to 30 s and accepts the timer range 1..2147483647', () => {
    expect(load(undefined)).toBe(30_000);
    expect(load('1')).toBe(1);
    expect(load('120000')).toBe(120_000);
    expect(load('2147483647')).toBe(2_147_483_647);
  });

  it('fails fast on values a timer cannot hold', () => {
    for (const value of ['0', '2147483648', '3000000000', '5000000000']) {
      expect(() => load(value), value).toThrow(/INFERENCE_TIMEOUT_MS/);
    }
  });

  it('accepts decimal digits only', () => {
    for (const value of ['1e3', '0x7530', ' 30000 ', '30000.0', '-5', '']) {
      expect(() => load(value), JSON.stringify(value)).toThrow(/INFERENCE_TIMEOUT_MS/);
    }
  });
});

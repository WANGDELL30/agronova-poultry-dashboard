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

describe('loadVisionConfig INFERENCE_HEALTH_TIMEOUT_MS (AUDIT R13)', () => {
  it('defaults to 5 s, separate from the upload timeout', () => {
    const config = loadVisionConfig({ INFERENCE_TIMEOUT_MS: '120000' });
    expect(config.inferenceHealthTimeoutMs).toBe(5_000);
    expect(config.inferenceTimeoutMs).toBe(120_000);
  });

  it('reads and validates the env var like INFERENCE_TIMEOUT_MS', () => {
    expect(loadVisionConfig({ INFERENCE_HEALTH_TIMEOUT_MS: '2000' }).inferenceHealthTimeoutMs).toBe(
      2_000,
    );
    for (const value of ['0', '1e3', '2147483648']) {
      expect(() => loadVisionConfig({ INFERENCE_HEALTH_TIMEOUT_MS: value })).toThrow(
        /INFERENCE_HEALTH_TIMEOUT_MS/,
      );
    }
  });
});

describe('loadVisionConfig VISION_MAX_IMAGE_BYTES (AUDIT H8)', () => {
  // Same list as apps/inference/tests/test_config.py: both services must agree.
  const rejected = ['-1', '0', '', 'abc', '8e6', '8388608.0'];
  const load = (value: string) => loadVisionConfig({ VISION_MAX_IMAGE_BYTES: value });

  it.each(rejected)('fails fast on %j', (value) => {
    expect(() => load(value)).toThrow(/VISION_MAX_IMAGE_BYTES/);
  });

  it('accepts decimal digits >= 1 and defaults to 8 MiB', () => {
    expect(load('1').maxImageBytes).toBe(1);
    expect(load('8388608').maxImageBytes).toBe(8388608);
    expect(loadVisionConfig({}).maxImageBytes).toBe(8 * 1024 * 1024);
  });
});

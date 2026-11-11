import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LIVE_INTERVAL_MS,
  DEFAULT_MOCK_INTERVAL_MS,
  resolveInterval,
} from './create-telemetry-source';

describe('polling interval from env (AUDIT H7)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses a single 3000 ms live default when the variable is unset or empty', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(DEFAULT_LIVE_INTERVAL_MS).toBe(3_000);
    expect(resolveInterval(undefined)).toBe(3_000);
    expect(resolveInterval('')).toBe(3_000);
    expect(resolveInterval('   ')).toBe(3_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts plain integers from 1000 to 3600000 ms', () => {
    expect(resolveInterval('1000')).toBe(1_000);
    expect(resolveInterval('3600000')).toBe(3_600_000);
    expect(resolveInterval('5000', DEFAULT_MOCK_INTERVAL_MS)).toBe(5_000);
  });

  it.each(['2147483648', '3600001', '999', '-5', 'abc', '1500.5', '1e4', '0x7d0'])(
    'rejects %s with a warning and falls back to the default',
    (value) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(resolveInterval(value, DEFAULT_LIVE_INTERVAL_MS, 'NEXT_PUBLIC_LIVE_INTERVAL_MS')).toBe(
        3_000,
      );
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain('NEXT_PUBLIC_LIVE_INTERVAL_MS');
    },
  );
});

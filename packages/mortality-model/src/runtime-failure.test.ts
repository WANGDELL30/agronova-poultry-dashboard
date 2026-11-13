import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

// A corrupted artifact: the stored checksum no longer matches the weights (AUDIT H12).
vi.mock('./model-artifact.json', async (importOriginal) => {
  const original = (await importOriginal()) as { default: Record<string, unknown> };
  return { default: { ...original.default, weights_sha256: '0'.repeat(64) } };
});
vi.mock('node:crypto', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('node:crypto');
  return { ...original, createHash: vi.fn(original.createHash) };
});

const { getModelStatus, PermanentModelError, reportModelFailure } = await import('./runtime.js');

describe('permanent model failures (H12)', () => {
  it('caches a checksum mismatch instead of re-hashing the weights on every request', async () => {
    const first = await getModelStatus().catch((error: unknown) => error);
    const second = await getModelStatus().catch((error: unknown) => error);
    expect(first).toBeInstanceOf(PermanentModelError);
    expect(second).toBe(first);
    expect(vi.mocked(createHash)).toHaveBeenCalledTimes(1);
  });

  it('logs the same failure once, and a new failure again', () => {
    const log = vi.fn();
    const permanent = new PermanentModelError('Model weight checksum mismatch.');
    reportModelFailure(permanent, log);
    reportModelFailure(permanent, log);
    expect(log).toHaveBeenCalledTimes(1);
    reportModelFailure(new Error('transient'), log);
    expect(log).toHaveBeenCalledTimes(2);
  });
});

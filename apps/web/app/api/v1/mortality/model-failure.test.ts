// @vitest-environment node
import { getModelStatus } from '@agronova/mortality-model';
import { describe, expect, it, vi } from 'vitest';

import { GET } from './model/route';

vi.mock('@agronova/mortality-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agronova/mortality-model')>()),
  getModelStatus: vi.fn(),
}));

describe('Vercel mortality model failure (H12)', () => {
  it('logs the cause once before answering 503', async () => {
    // Set here, not in the factory: the web config restores mocks before each test.
    vi.mocked(getModelStatus).mockRejectedValue(new Error('Model weight checksum mismatch.'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = await GET();
    expect(first.status).toBe(503);
    expect(first.headers.get('cache-control')).toBe('no-store'); // K9
    expect((await GET()).status).toBe(503);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('checksum mismatch');
  });
});

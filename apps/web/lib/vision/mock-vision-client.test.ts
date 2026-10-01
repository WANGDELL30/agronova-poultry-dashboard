import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MockVisionClient } from './mock-vision-client';

describe('MockVisionClient', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x') }));
  });
  const input = {
    file: new File(['x'], 'a.jpg'),
    cameraId: 'cam-01',
    capturedAt: '2026-10-01T01:00:00.000Z',
  };

  it('always flags results as mock and keeps non-classified statuses free of a result', async () => {
    const client = new MockVisionClient();
    const records = [];
    for (let i = 0; i < 5; i++) records.push(await client.submit(input));
    expect(records.every((r) => r.inference_mode === 'mock')).toBe(true);
    expect(records.map((r) => r.status)).toEqual([
      'classified',
      'classified',
      'classified',
      'skipped_quality',
      'parse_error',
    ]);
    for (const r of records) expect(r.status === 'classified' ? r.result : null).toBe(r.result);
    expect(records[2]!.result).toMatchObject({ label: 'undefined', confidence: null });
    expect((await client.list())[0]).toBe(records[4]);
  });
});

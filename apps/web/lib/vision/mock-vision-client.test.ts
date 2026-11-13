import { VOTE_WINDOW_SIZE } from '@agronova/vision-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MOCK_RECORDS_KEPT, MockVisionClient } from './mock-vision-client';

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

  it('votes per scenario with the same rule as the API voter (K6)', async () => {
    const client = new MockVisionClient();
    const records = [];
    for (let i = 0; i < 5; i++) records.push(await client.submit(input));
    expect(records.map((r) => [r.vote.status, r.vote.window_filled])).toEqual([
      ['waiting_window', 1],
      ['waiting_window', 2],
      ['ignored_undefined', 2],
      ['ignored_no_result', 2],
      ['ignored_no_result', 2],
    ]);
    expect(records.every((r) => r.vote.window_size === VOTE_WINDOW_SIZE)).toBe(true);
  });

  it('computes score_stress as total_ya / 7, like the Python rule (K6)', async () => {
    const client = new MockVisionClient();
    for (let i = 0; i < 3; i++) {
      const { result } = await client.submit(input);
      expect(result!.score_stress).toBeCloseTo(result!.total_ya / 7, 10);
    }
  });

  it('fills the window from voted frames only and alerts on a stress majority', async () => {
    const client = new MockVisionClient();
    const votes = [];
    for (let i = 0; i < 12; i++) votes.push((await client.submit(input)).vote);
    // Each cycle of 5 uploads adds one not_stress and one stress vote.
    expect(votes[10]).toMatchObject({ status: 'no_alert', majority_label: 'not_stress' });
    expect(votes[11]).toMatchObject({ status: 'alert', trigger_alert: true, majority_count: 3 });
  });

  it('keeps only the last N uploads and revokes the oldest blob URL (H18)', async () => {
    let next = 0;
    const createObjectURL = vi.fn(() => `blob:${next++}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const client = new MockVisionClient();
    const records = [];
    for (let i = 0; i < MOCK_RECORDS_KEPT; i++) records.push(await client.submit(input));
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const newest = await client.submit(input);
    expect(MOCK_RECORDS_KEPT).toBe(20);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:0');
    expect(client.imageUrl(records[0]!)).toBeNull();
    expect(client.imageUrl(newest)).toBe(`blob:${MOCK_RECORDS_KEPT}`);
    const list = await client.list();
    expect(list).toHaveLength(MOCK_RECORDS_KEPT);
    expect(list[0]).toBe(newest);
    expect(list).not.toContain(records[0]);
  });
});

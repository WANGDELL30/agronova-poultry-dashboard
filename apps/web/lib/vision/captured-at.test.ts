import { describe, expect, it } from 'vitest';

import { capturedAtForFile } from './captured-at';

describe('capturedAtForFile (AUDIT R8)', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z');

  it('keeps a plausible file modification time, even an old one', () => {
    expect(capturedAtForFile(Date.parse('2023-05-01T08:00:00.000Z'), now)).toBe(
      '2023-05-01T08:00:00.000Z',
    );
  });

  it('uses the upload time for a missing, future or pre-2020 file date', () => {
    for (const lastModified of [Number.NaN, 0, Date.parse('2019-12-31T23:59:59Z'), now + 1]) {
      expect(capturedAtForFile(lastModified, now), String(lastModified)).toBe(
        '2026-11-22T12:00:00.000Z',
      );
    }
  });
});

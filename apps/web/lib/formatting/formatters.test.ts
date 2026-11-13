import { describe, expect, it } from 'vitest';

import { formatChartTime, formatDateTime, formatRelativeTime } from './formatters';

describe('time formatters (AUDIT R18)', () => {
  const now = new Date('2026-11-12T17:30:00.000Z');

  it.each([formatDateTime, formatChartTime, formatRelativeTime])(
    'shows an em dash for input without an offset or an invalid date, without throwing',
    (format) => {
      expect(format('2026-11-09T17:30:00', 'id-ID')).toBe('—');
      expect(format('bukan tanggal', 'en-US')).toBe('—');
      expect(format('2026-13-45T99:00:00Z', 'en-US')).toBe('—');
    },
  );

  it('accepts Z and numeric offsets', () => {
    expect(formatChartTime('2026-11-09T17:30:00Z', 'en-GB')).toBe('00:30');
    expect(formatChartTime('2026-11-10T00:30:00+07:00', 'en-GB')).toBe('00:30');
    expect(formatChartTime('2026-11-09T17:30:00.000Z', 'en-GB')).toBe('00:30');
  });

  it('uses days for differences of 24 hours or more', () => {
    expect(formatRelativeTime('2026-11-09T17:30:00Z', 'id-ID', now)).toBe('3 hari yang lalu');
    expect(formatRelativeTime('2026-11-09T17:30:00Z', 'en-US', now)).toBe('3 days ago');
    expect(formatRelativeTime('2026-11-11T18:30:00Z', 'en-US', now)).toBe('23 hours ago');
  });
});

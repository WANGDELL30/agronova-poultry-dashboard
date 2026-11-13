export const APPLICATION_TIMEZONE = 'Asia/Jakarta';

/** Shown instead of a time that cannot be placed on the UTC timeline (AUDIT R18). */
export const MISSING_TIME = '—';

/** Ends in `Z` or a numeric offset such as `+07:00`; anything else would be read as browser-local time. */
const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Parses an ISO timestamp only when it carries an offset and is a real date; otherwise null. */
function parseTimestamp(timestamp: string): Date | null {
  if (!EXPLICIT_OFFSET.test(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(timestamp: string, locale: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return MISSING_TIME;
  return new Intl.DateTimeFormat(locale, {
    timeZone: APPLICATION_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export function formatClock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APPLICATION_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatChartTime(timestamp: string, locale: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return MISSING_TIME;
  return new Intl.DateTimeFormat(locale, {
    timeZone: APPLICATION_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatRelativeTime(timestamp: string, locale: string, now = new Date()): string {
  const date = parseTimestamp(timestamp);
  if (!date) return MISSING_TIME;
  const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(deltaSeconds) < 60) {
    return formatter.format(deltaSeconds, 'second');
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, 'minute');
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, 'hour');
  }

  return formatter.format(Math.round(deltaHours / 24), 'day');
}

export function formatNumber(value: number, locale: string, digits = 1): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDuration(totalSeconds: number, locale: string): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const parts = new Intl.ListFormat(locale, { style: 'short', type: 'unit' });
  const units =
    locale === 'id-ID'
      ? { day: 'h', hour: 'j', minute: 'm' }
      : { day: 'd', hour: 'h', minute: 'm' };
  const values = [
    days > 0 ? `${days}${units.day}` : null,
    `${hours}${units.hour}`,
    `${minutes}${units.minute}`,
  ].filter((value): value is string => value !== null);

  return parts.format(values);
}

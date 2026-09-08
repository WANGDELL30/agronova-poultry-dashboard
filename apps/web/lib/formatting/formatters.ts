export const APPLICATION_TIMEZONE = 'Asia/Jakarta';

export function formatDateTime(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APPLICATION_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp));
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
  return new Intl.DateTimeFormat(locale, {
    timeZone: APPLICATION_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatRelativeTime(timestamp: string, locale: string, now = new Date()): string {
  const deltaSeconds = Math.round((new Date(timestamp).getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(deltaSeconds) < 60) {
    return formatter.format(deltaSeconds, 'second');
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, 'minute');
  }

  return formatter.format(Math.round(deltaMinutes / 60), 'hour');
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

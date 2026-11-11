/** Single default for live polling (NEXT_PUBLIC_LIVE_INTERVAL_MS), as documented in the README. */
export const DEFAULT_LIVE_INTERVAL_MS = 3_000;
/** Default for the explicit development mock (NEXT_PUBLIC_MOCK_INTERVAL_MS), as documented. */
export const DEFAULT_MOCK_INTERVAL_MS = 5_000;

export const MIN_INTERVAL_MS = 1_000;
/** Browsers overflow timers above 2^31-1 ms and fire them almost immediately (AUDIT H7). */
export const MAX_INTERVAL_MS = 3_600_000;

/**
 * Parses a polling interval from a public env var. Unset or empty means "use the default".
 * Anything that is not a plain integer between 1000 and 3600000 ms is rejected with a warning.
 */
export function resolveInterval(
  value: string | undefined,
  fallback = DEFAULT_LIVE_INTERVAL_MS,
  name = 'polling interval',
): number {
  const raw = value?.trim() ?? '';
  if (raw === '') return fallback;
  const interval = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (interval >= MIN_INTERVAL_MS && interval <= MAX_INTERVAL_MS) return interval;
  console.warn(
    `[agronova/web] ${name}="${raw}" is not an integer between ${MIN_INTERVAL_MS} and ` +
      `${MAX_INTERVAL_MS} ms; using ${fallback} ms.`,
  );
  return fallback;
}

'use client';

import { useEffect, useState } from 'react';

import type { DashboardSnapshot } from './types';

/**
 * The telemetry receipt does not carry the API's offline threshold, so the web app uses the same
 * value as the API default (`DEVICE_OFFLINE_AFTER_MS=30000` in apps/api telemetry.service.ts).
 * Keep both in sync if the API default changes.
 */
export const DEVICE_OFFLINE_AFTER_MS = 30_000;

/** One failed poll is tolerated as a blip; this many in a row mark the data as stale. */
export const STALE_AFTER_FAILED_POLLS = 2;

/**
 * - `live`: the API answers and the device reported within the offline threshold.
 * - `disconnected`: the last polls failed; the numbers shown are the last received reading.
 * - `deviceSilent`: the API answers, but the device has not sent data for too long.
 */
export type TelemetryFreshness = 'live' | 'disconnected' | 'deviceSilent';

export function snapshotFreshness(snapshot: DashboardSnapshot, now: number): TelemetryFreshness {
  if (snapshot.stale) return 'disconnected';
  if (now - Date.parse(snapshot.last_seen_at) > DEVICE_OFFLINE_AFTER_MS) return 'deviceSilent';
  return 'live';
}

/** `device_online` from the API is only valid at fetch time; re-check it against the clock. */
export function isDeviceOnline(snapshot: DashboardSnapshot, now: number): boolean {
  return snapshot.deviceOnline && snapshotFreshness(snapshot, now) === 'live';
}

/** Current time that re-renders the component every `intervalMs` (relative times, staleness). */
export function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

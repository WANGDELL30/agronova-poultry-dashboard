import { createHash, timingSafeEqual } from 'node:crypto';

/** Header a device sends its key in. Lower case: Node lower-cases incoming header names. */
export const DEVICE_KEY_HEADER = 'x-device-key';
/** Shorter keys are rejected at startup: a device key is the only thing guarding ingest. */
export const MIN_DEVICE_KEY_LENGTH = 16;
/** Same limit as `device_id` in the telemetry schema. */
const MAX_DEVICE_ID_LENGTH = 128;

export const TELEMETRY_AUTH = Symbol('TELEMETRY_AUTH');

export interface TelemetryAuthConfig {
  /** device_id -> key. Null when TELEMETRY_DEVICE_KEYS is empty: ingest is open (local use only). */
  deviceKeys: ReadonlyMap<string, string> | null;
}

function fail(message: string): never {
  // Never echo a key: the message ends up in logs.
  throw new Error(`TELEMETRY_DEVICE_KEYS is invalid: ${message}`);
}

/**
 * Parses `TELEMETRY_DEVICE_KEYS`: comma-separated `device_id=key` pairs, split at the first `=`.
 * Empty or unset turns device authentication off. Every key must be unique, because the key alone
 * identifies the device before the body is read.
 */
export function parseDeviceKeys(value: string | undefined): ReadonlyMap<string, string> | null {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;

  const keys = new Map<string, string>();
  const seenKeys = new Set<string>();
  entries.forEach((entry, index) => {
    const position = `entry ${index + 1}`;
    const separator = entry.indexOf('=');
    if (separator === -1) fail(`${position} must look like device_id=key.`);
    const deviceId = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();
    if (deviceId === '' || deviceId.length > MAX_DEVICE_ID_LENGTH) {
      fail(`${position} needs a device_id of 1 to ${MAX_DEVICE_ID_LENGTH} characters.`);
    }
    if (key.length < MIN_DEVICE_KEY_LENGTH || /\s/.test(key)) {
      fail(
        `the key for "${deviceId}" must be at least ${MIN_DEVICE_KEY_LENGTH} characters without spaces.`,
      );
    }
    if (keys.has(deviceId)) fail(`device_id "${deviceId}" is listed twice.`);
    if (seenKeys.has(key)) fail(`the key for "${deviceId}" is also used by another device.`);
    keys.set(deviceId, key);
    seenKeys.add(key);
  });
  return keys;
}

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/**
 * The device a key belongs to, or null. Every configured key is compared in constant time (equal
 * length SHA-256 digests), so the response time does not reveal how much of a key matched.
 */
export function deviceForKey(
  keys: ReadonlyMap<string, string>,
  presented: string | undefined,
): string | null {
  if (!presented) return null;
  const candidate = digest(presented);
  let match: string | null = null;
  for (const [deviceId, key] of keys) {
    if (timingSafeEqual(candidate, digest(key)) && match === null) match = deviceId;
  }
  return match;
}

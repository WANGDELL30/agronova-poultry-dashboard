import { MIN_KEY_LENGTH, ownerOfKey, parseKeyList } from '../common/keys.js';

/** Header a device sends its key in. Lower case: Node lower-cases incoming header names. */
export const DEVICE_KEY_HEADER = 'x-device-key';
export const MIN_DEVICE_KEY_LENGTH = MIN_KEY_LENGTH;

export const TELEMETRY_AUTH = Symbol('TELEMETRY_AUTH');

export interface TelemetryAuthConfig {
  /** device_id -> key. Null when TELEMETRY_DEVICE_KEYS is empty: ingest is open (local use only). */
  deviceKeys: ReadonlyMap<string, string> | null;
}

/**
 * Parses `TELEMETRY_DEVICE_KEYS`: comma-separated `device_id=key` pairs. Empty or unset turns device
 * authentication off. `device_id` has the same 128-character limit as the telemetry schema.
 */
export function parseDeviceKeys(value: string | undefined): ReadonlyMap<string, string> | null {
  return parseKeyList(
    { envName: 'TELEMETRY_DEVICE_KEYS', idLabel: 'device_id', maxIdLength: 128 },
    value,
  );
}

/** The device a key belongs to, or null (constant-time comparison). */
export const deviceForKey = ownerOfKey;

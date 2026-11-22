import { ownerOfKey, parseKeyList } from '../common/keys.js';

/** Header a camera or gateway sends its key in (lower case, as Node delivers it). */
export const CAMERA_KEY_HEADER = 'x-camera-key';

const HOUR_MS = 60 * 60 * 1000;
/** Bounds the per-IP bookkeeping itself, so the limiter cannot be used to exhaust memory. */
const MAX_TRACKED_IPS = 10_000;

/**
 * Who may upload frames and how much (AUDIT S2, decision 2026-11-22). Cameras authenticate with a
 * key and vote; keyless uploads (the dashboard's "try a photo") are rate limited per IP and, while
 * camera keys are configured, become `manual`: classified but never voting or alerting.
 */
export interface UploadPolicy {
  /** camera_id -> key. Null when VISION_CAMERA_KEYS is unset: every upload counts as a camera. */
  cameraKeys: ReadonlyMap<string, string> | null;
  /** Keyless uploads per client IP in a sliding hour. */
  keylessPerIpPerHour: number;
  /** Keyless uploads from all IPs together in a sliding hour. */
  keylessPerHour: number;
  /** Minimum time between two accepted frames of one authenticated camera; 0 = no minimum. */
  cameraMinIntervalMs: number;
  /** Stored camera records (and their images); the oldest are removed first. */
  maxCameraRecords: number;
  /** Stored manual records (and their images); the oldest are removed first. */
  maxManualRecords: number;
}

/** Used only when a module does not provide a policy (unit-test modules): nothing is limited. */
export const UNLIMITED_UPLOAD_POLICY: UploadPolicy = {
  cameraKeys: null,
  keylessPerIpPerHour: Number.POSITIVE_INFINITY,
  keylessPerHour: Number.POSITIVE_INFINITY,
  cameraMinIntervalMs: 0,
  maxCameraRecords: Number.POSITIVE_INFINITY,
  maxManualRecords: Number.POSITIVE_INFINITY,
};

function wholeNumber(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be a whole number >= ${min} (digits only); received "${value}".`);
  }
  return parsed;
}

export function loadUploadPolicy(env: NodeJS.ProcessEnv = process.env): UploadPolicy {
  return {
    cameraKeys: parseKeyList(
      { envName: 'VISION_CAMERA_KEYS', idLabel: 'camera_id', maxIdLength: 64 },
      env.VISION_CAMERA_KEYS,
    ),
    keylessPerIpPerHour: wholeNumber(
      'VISION_MANUAL_UPLOADS_PER_IP_PER_HOUR',
      env.VISION_MANUAL_UPLOADS_PER_IP_PER_HOUR,
      10,
      1,
    ),
    keylessPerHour: wholeNumber(
      'VISION_MANUAL_UPLOADS_PER_HOUR',
      env.VISION_MANUAL_UPLOADS_PER_HOUR,
      60,
      1,
    ),
    cameraMinIntervalMs: wholeNumber(
      'VISION_CAMERA_INTERVAL_MS',
      env.VISION_CAMERA_INTERVAL_MS,
      10_000,
      0,
    ),
    maxCameraRecords: wholeNumber(
      'VISION_MAX_CAMERA_RECORDS',
      env.VISION_MAX_CAMERA_RECORDS,
      2000,
      1,
    ),
    maxManualRecords: wholeNumber(
      'VISION_MAX_MANUAL_RECORDS',
      env.VISION_MAX_MANUAL_RECORDS,
      200,
      1,
    ),
  };
}

export type UploadAuth =
  { kind: 'camera'; cameraId: string } | { kind: 'keyless' } | { kind: 'invalid_key' };

/**
 * Decides before the body is read. A presented key must be valid when keys are configured; when none
 * are configured the header is ignored (there is nothing to check it against).
 */
export function authenticateUpload(
  policy: UploadPolicy,
  presented: string | undefined,
): UploadAuth {
  if (policy.cameraKeys === null || presented === undefined) return { kind: 'keyless' };
  const cameraId = ownerOfKey(policy.cameraKeys, presented);
  return cameraId === null ? { kind: 'invalid_key' } : { kind: 'camera', cameraId };
}

/** In-memory sliding-window limits. State is lost on restart, which only relaxes the limits. */
export class UploadLimiter {
  private readonly perIp = new Map<string, number[]>();
  private all: number[] = [];
  private readonly lastCameraFrame = new Map<string, number>();

  constructor(private readonly policy: UploadPolicy) {}

  /**
   * Admits one keyless upload from `ip` at `now`, or returns the seconds to wait. Nothing is counted
   * when the upload is refused.
   */
  admitKeyless(ip: string, now: number): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const cutoff = now - HOUR_MS;
    this.all = this.all.filter((stamp) => stamp > cutoff);
    const mine = (this.perIp.get(ip) ?? []).filter((stamp) => stamp > cutoff);
    const waitFor = (stamps: number[], limit: number) =>
      stamps.length >= limit ? Math.max(1, Math.ceil((stamps[0]! + HOUR_MS - now) / 1000)) : 0;
    const wait = Math.max(
      waitFor(mine, this.policy.keylessPerIpPerHour),
      waitFor(this.all, this.policy.keylessPerHour),
    );
    if (wait > 0) {
      if (mine.length > 0) this.perIp.set(ip, mine);
      return { ok: false, retryAfterSeconds: wait };
    }
    mine.push(now);
    this.all.push(now);
    this.perIp.delete(ip); // re-insert so the map stays ordered by last use
    this.perIp.set(ip, mine);
    if (this.perIp.size > MAX_TRACKED_IPS) {
      this.perIp.delete(this.perIp.keys().next().value as string);
    }
    return { ok: true };
  }

  /** Admits one frame of an authenticated camera, or returns the seconds to wait. */
  admitCamera(
    cameraId: string,
    now: number,
  ): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const last = this.lastCameraFrame.get(cameraId);
    const interval = this.policy.cameraMinIntervalMs;
    if (last !== undefined && now - last < interval) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((last + interval - now) / 1000)),
      };
    }
    this.lastCameraFrame.set(cameraId, now);
    return { ok: true };
  }
}

import { createHash, timingSafeEqual } from 'node:crypto';

/** Shorter keys are rejected at startup: a key is the only thing guarding the endpoint. */
export const MIN_KEY_LENGTH = 16;

export interface KeyListSpec {
  /** Environment variable name, used in error messages. */
  envName: string;
  /** What the left-hand side identifies, e.g. `device_id`. */
  idLabel: string;
  /** Same limit as the id field in the contract. */
  maxIdLength: number;
}

/**
 * Parses comma-separated `id=key` pairs, split at the first `=`. Empty or unset returns null
 * (authentication off). Every key must be unique, because the key alone identifies its owner before
 * the request body is read. Error messages never echo a key: they end up in logs.
 */
export function parseKeyList(
  spec: KeyListSpec,
  value: string | undefined,
): ReadonlyMap<string, string> | null {
  const fail = (message: string): never => {
    throw new Error(`${spec.envName} is invalid: ${message}`);
  };
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
    if (separator === -1) fail(`${position} must look like ${spec.idLabel}=key.`);
    const id = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();
    if (id === '' || id.length > spec.maxIdLength) {
      fail(`${position} needs a ${spec.idLabel} of 1 to ${spec.maxIdLength} characters.`);
    }
    if (key.length < MIN_KEY_LENGTH || /\s/.test(key)) {
      fail(`the key for "${id}" must be at least ${MIN_KEY_LENGTH} characters without spaces.`);
    }
    if (keys.has(id)) fail(`${spec.idLabel} "${id}" is listed twice.`);
    if (seenKeys.has(key)) fail(`the key for "${id}" is also used by another ${spec.idLabel}.`);
    keys.set(id, key);
    seenKeys.add(key);
  });
  return keys;
}

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/**
 * The id a key belongs to, or null. Every configured key is compared in constant time (equal-length
 * SHA-256 digests), so the response time does not reveal how much of a key matched.
 */
export function ownerOfKey(
  keys: ReadonlyMap<string, string>,
  presented: string | undefined,
): string | null {
  if (!presented) return null;
  const candidate = digest(presented);
  let match: string | null = null;
  for (const [id, key] of keys) {
    if (timingSafeEqual(candidate, digest(key)) && match === null) match = id;
  }
  return match;
}

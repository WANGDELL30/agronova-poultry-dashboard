import { describe, expect, it } from 'vitest';

import { deviceForKey, parseDeviceKeys } from './device-keys.js';

const KEY_A = 'aaaaaaaaaaaaaaaa1';
const KEY_B = 'bbbbbbbbbbbbbbbb2';

describe('parseDeviceKeys', () => {
  it('turns authentication off when unset or blank', () => {
    for (const value of [undefined, '', '  ', ' , ,']) {
      expect(parseDeviceKeys(value)).toBeNull();
    }
  });

  it('reads device_id=key pairs, trimmed, split at the first "="', () => {
    const keys = parseDeviceKeys(` ESP32-01 = ${KEY_A} , ESP32-02=${KEY_B}==`);
    expect([...(keys ?? [])]).toEqual([
      ['ESP32-01', KEY_A],
      ['ESP32-02', `${KEY_B}==`],
    ]);
  });

  it('rejects malformed entries without echoing the key', () => {
    const cases: Array<[string, RegExp]> = [
      ['ESP32-01', /device_id=key/],
      [`=${KEY_A}`, /device_id of 1 to 128/],
      [`${'x'.repeat(129)}=${KEY_A}`, /device_id of 1 to 128/],
      ['ESP32-01=short', /at least 16 characters/],
      ['ESP32-01=has a space inside!', /without spaces/],
      [`ESP32-01=${KEY_A},ESP32-01=${KEY_B}`, /listed twice/],
      [`ESP32-01=${KEY_A},ESP32-02=${KEY_A}`, /also used by another device/],
    ];
    for (const [value, message] of cases) {
      expect(() => parseDeviceKeys(value)).toThrow(message);
      try {
        parseDeviceKeys(value);
      } catch (error) {
        expect((error as Error).message).not.toContain(KEY_A);
        expect((error as Error).message).not.toContain('has a space');
      }
    }
  });
});

describe('deviceForKey', () => {
  const keys = parseDeviceKeys(`ESP32-01=${KEY_A},ESP32-02=${KEY_B}`)!;

  it('returns the device that owns the key', () => {
    expect(deviceForKey(keys, KEY_A)).toBe('ESP32-01');
    expect(deviceForKey(keys, KEY_B)).toBe('ESP32-02');
  });

  it('returns null for a missing, empty, unknown or partial key', () => {
    for (const presented of [
      undefined,
      '',
      'unknown-key-value-123',
      KEY_A.slice(0, -1),
      `${KEY_A}x`,
    ]) {
      expect(deviceForKey(keys, presented)).toBeNull();
    }
  });
});

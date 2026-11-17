import { SensorQuality } from '@agronova/telemetry-schema';
import { describe, expect, it } from 'vitest';

import {
  ALERT_VOTE,
  NO_THRESHOLDS,
  TIME_ZONE,
  receipt,
  snapshot,
  visionResult,
} from '../test-fixtures.js';

import { activeConditions } from './rules.js';

const keys = (overrides: Parameters<typeof snapshot>[0], thresholds = NO_THRESHOLDS) =>
  activeConditions(snapshot(overrides), thresholds, TIME_ZONE).map((condition) => condition.key);

describe('activeConditions', () => {
  it('is empty for a healthy house', () => {
    expect(keys({})).toEqual([]);
  });

  it('raises nothing when the API holds no reading', () => {
    expect(keys({ telemetry: null })).toEqual([]);
  });

  it('reports an offline device once, without per-sensor noise', () => {
    expect(keys({ telemetry: receipt({ online: false }) })).toEqual([
      'device-offline:AGRONOVA-ESP32-01',
    ]);
  });

  it('reports disconnected and invalid sensors, but not sensors that were never installed', () => {
    expect(
      keys({
        telemetry: receipt({
          quality: { air_humidity: SensorQuality.DISCONNECTED, mq5: SensorQuality.INVALID },
        }),
      }),
    ).toEqual(['sensor:AGRONOVA-ESP32-01:air_humidity', 'sensor:AGRONOVA-ESP32-01:mq5']);
  });

  it('has no thresholds unless they are configured', () => {
    const hot = receipt({ readings: { air_temperature_c: { raw: 45, filtered: 45 } } });
    expect(keys({ telemetry: hot })).toEqual([]);
    expect(keys({ telemetry: hot }, { ...NO_THRESHOLDS, tempMaxC: 32 })).toEqual([
      'threshold:AGRONOVA-ESP32-01:air_temperature:high',
    ]);
  });

  it('compares thresholds only against VALID readings', () => {
    const calibrating = receipt({
      readings: { air_temperature_c: { raw: 45, filtered: 45 } },
      quality: { air_temperature: SensorQuality.CALIBRATING },
    });
    expect(keys({ telemetry: calibrating }, { ...NO_THRESHOLDS, tempMaxC: 32 })).toEqual([]);
  });

  it('raises a vision alert only from the newest frame of a camera', () => {
    const stale = [visionResult('not_stress'), visionResult('stress', { vote: ALERT_VOTE })];
    expect(keys({ vision: stale })).toEqual([]);
    const current = [visionResult('stress', { vote: ALERT_VOTE })];
    const conditions = activeConditions(snapshot({ vision: current }), NO_THRESHOLDS, TIME_ZONE);
    expect(conditions.map((c) => c.key)).toEqual(['vision-alert:CAM-01']);
    expect(conditions[0]?.text).toContain('bukan diagnosis');
  });
});

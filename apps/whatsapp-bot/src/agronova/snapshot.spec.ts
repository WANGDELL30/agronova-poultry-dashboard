import { SensorQuality } from '@agronova/telemetry-schema';
import { describe, expect, it } from 'vitest';

import {
  ALERT_VOTE,
  TIME_ZONE,
  UNREACHABLE,
  receipt,
  snapshot,
  visionResult,
} from '../test-fixtures.js';

import { describeSnapshot, formatTime, latestPerCamera } from './snapshot.js';

const describe_ = (overrides: Parameters<typeof snapshot>[0] = {}) =>
  describeSnapshot(snapshot(overrides), TIME_ZONE);

describe('describeSnapshot: sensor semantics', () => {
  it('shows valid readings with their units and converts UTC to the display zone', () => {
    const text = describe_();
    expect(text).toContain('Perangkat AGRONOVA-ESP32-01: ONLINE');
    expect(text).toContain('Suhu udara: 28.5 °C');
    expect(text).toContain('Kelembapan udara: 72.4 %');
    // 02:59:51 UTC is 09:59:51 in Jakarta (UTC+7).
    expect(formatTime('2026-11-17T02:59:51.000Z', TIME_ZONE)).toMatch(/09[.:]59[.:]51 WIB/);
  });

  it('never presents MQ-5 as ppm', () => {
    const text = describe_();
    expect(text).toContain('level relatif 31.5 %');
    expect(text).toContain('bukan ppm');
    expect(text.replace('bukan ppm', '')).not.toMatch(/ppm/i);
  });

  it('reports a missing value as missing with its status, never as zero', () => {
    const text = describe_();
    expect(text).toContain('Berat pakan: tidak ada nilai (sensor belum terpasang)');
    expect(text).not.toMatch(/Berat pakan: 0/);
  });

  it('withholds a number whose sensor is disconnected or invalid', () => {
    const text = describe_({
      telemetry: receipt({ quality: { air_temperature: SensorQuality.DISCONNECTED } }),
    });
    expect(text).toContain('Suhu udara: tidak ada nilai yang dapat dipakai (sensor terputus)');
    expect(text).not.toContain('28.5');
  });

  it('labels values from an offline device as old, not current', () => {
    const text = describe_({ telemetry: receipt({ online: false }) });
    expect(text).toContain('OFFLINE');
    expect(text).toMatch(/Suhu udara: 28\.5 °C \(nilai terakhir sebelum perangkat offline/);
  });

  it('says so when the API holds no reading or cannot be reached', () => {
    expect(describe_({ telemetry: null })).toContain('belum menerima pembacaan');
    expect(describeSnapshot(UNREACHABLE, TIME_ZONE)).toContain('tidak dapat dihubungi');
  });
});

describe('describeSnapshot: vision semantics', () => {
  it('words a classification as an indication, with the decision-support notice', () => {
    const text = describe_({ vision: [visionResult('stress', { vote: ALERT_VOTE })] });
    expect(text).toContain('bukan diagnosis');
    expect(text).toContain('terindikasi stres (4 dari 7 indikator bernilai YA)');
    expect(text).toContain('ALERT: 3 dari 5 frame terakhir');
  });

  it.each(['undefined', 'skipped_quality', 'inference_error'] as const)(
    'never words %s as not stressed',
    (kind) => {
      const text = describe_({ vision: [visionResult(kind)] });
      expect(text).toContain('ini bukan berarti tidak stres');
      expect(text).not.toContain('tidak terindikasi stres');
    },
  );

  it('flags mock inference results', () => {
    const text = describe_({ vision: [visionResult('not_stress', { inference_mode: 'mock' })] });
    expect(text).toContain('mode mock');
  });

  it('skips manual test uploads, so they never stand for a camera (S2)', () => {
    const manual = visionResult('stress', {
      camera_id: 'A',
      source: 'manual',
      vote: { ...visionResult('stress').vote, status: 'ignored_manual' },
    });
    const results = [manual, visionResult('not_stress', { camera_id: 'A' })];
    expect(latestPerCamera(results).map((r) => [r.camera_id, r.source, r.result?.label])).toEqual([
      ['A', 'camera', 'not_stress'],
    ]);
    expect(latestPerCamera([manual])).toEqual([]);
  });

  it('keeps only the newest result per camera', () => {
    const results = [
      visionResult('stress', { camera_id: 'A' }),
      visionResult('not_stress', { camera_id: 'B' }),
      visionResult('not_stress', { camera_id: 'A' }),
    ];
    expect(latestPerCamera(results).map((r) => [r.camera_id, r.result?.label])).toEqual([
      ['A', 'stress'],
      ['B', 'not_stress'],
    ]);
  });
});

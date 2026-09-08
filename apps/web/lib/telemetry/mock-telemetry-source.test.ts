import { SensorQuality } from '@agronova/telemetry-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiTelemetrySource } from './api-telemetry-source';
import { resolveDataMode, resolveInterval, resolveScenario } from './create-telemetry-source';
import { MockTelemetrySource } from './mock-telemetry-source';
import type { DashboardSnapshot } from './types';

describe('MockTelemetrySource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the specified deterministic readings and preserves UTC timestamps', async () => {
    const source = new MockTelemetrySource({ initialDelayMs: 0, intervalMs: 1_000 });
    const snapshot = await source.getInitialSnapshot();

    expect(snapshot.telemetry.readings.air_temperature_c).toEqual({ raw: 28.7, filtered: 28.5 });
    expect(snapshot.telemetry.readings.air_humidity_pct).toEqual({ raw: 73.1, filtered: 72.4 });
    expect(snapshot.telemetry.readings.water_temperature_c).toEqual({ raw: 26.9, filtered: 26.8 });
    expect(snapshot.telemetry.readings.mq5).toEqual({
      raw_adc: 1_304,
      filtered_adc: 1_289,
      adc_voltage_v: 0.5,
      relative_level_pct: 31.5,
    });
    expect(snapshot.telemetry.device).toEqual({
      firmware_version: '0.2.0',
      uptime_s: 18_452,
      wifi_rssi_dbm: -61,
    });
    expect(snapshot.telemetry.captured_at).toMatch(/Z$/);
    expect(snapshot.received_at).toMatch(/Z$/);
    expect(new Date(snapshot.received_at).getTime()).toBeGreaterThan(
      new Date(snapshot.telemetry.captured_at).getTime(),
    );
    expect(Object.keys(snapshot.telemetry.readings.mq5 ?? {})).not.toContain('ppm');
  });

  it('emits predictable updates and stops its timer cleanly', async () => {
    const source = new MockTelemetrySource({ initialDelayMs: 0, intervalMs: 1_000 });
    const initial = await source.getInitialSnapshot();
    const listener = vi.fn<(snapshot: DashboardSnapshot) => void>();
    const unsubscribe = source.subscribe(listener);

    source.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0].telemetry.sequence_no).toBe(
      initial.telemetry.sequence_no + 2,
    );

    unsubscribe();
    source.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps unavailable readings null and marks their sensors as not installed', async () => {
    const source = new MockTelemetrySource({
      scenario: 'sensor-not-installed',
      initialDelayMs: 0,
    });
    const snapshot = await source.getInitialSnapshot();

    expect(snapshot.telemetry.readings.water_temperature_c).toBeNull();
    expect(snapshot.telemetry.readings.ammonia_adc).toBeNull();
    expect(snapshot.telemetry.readings.water_flow_l_min).toBeNull();
    expect(snapshot.telemetry.readings.feed_weight_kg).toBeNull();
    expect(snapshot.telemetry.quality.water_temperature).toBe(SensorQuality.NOT_INSTALLED);
  });

  it('updates acknowledgement state locally', async () => {
    const source = new MockTelemetrySource({ initialDelayMs: 0 });
    const listener = vi.fn<(snapshot: DashboardSnapshot) => void>();
    source.subscribe(listener);

    source.acknowledgeAlert('high-humidity');

    const alert = listener.mock.calls[0]?.[0].alerts.find(({ id }) => id === 'high-humidity');
    expect(alert?.acknowledged).toBe(true);
  });
});

describe('telemetry source selection', () => {
  it('uses safe defaults for invalid public configuration', () => {
    expect(resolveDataMode(undefined)).toBe('mock');
    expect(resolveDataMode('unexpected')).toBe('mock');
    expect(resolveScenario('unexpected')).toBe('normal');
    expect(resolveInterval('50')).toBe(5_000);
  });

  it('keeps API mode explicitly unavailable during F1', async () => {
    const source = new ApiTelemetrySource();

    await expect(source.getInitialSnapshot()).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

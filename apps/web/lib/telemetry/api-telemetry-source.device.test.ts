import { validTelemetryV1Example, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkDeviceId } from '../config/api-base-url-check';
import { ApiTelemetrySource } from './api-telemetry-source';
import type { DashboardSnapshot } from './types';

let sequence = 0;
function reading(deviceId: string, second: number, temperature: number): TelemetryReceiptV1 {
  sequence += 1;
  const at = `2026-01-01T01:00:${String(second).padStart(2, '0')}.000Z`;
  return {
    telemetry: {
      ...validTelemetryV1Example,
      device_id: deviceId,
      message_id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
      captured_at: at,
      readings: {
        ...validTelemetryV1Example.readings,
        air_temperature_c: { raw: temperature, filtered: temperature },
      },
    },
    received_at: at,
    last_seen_at: at,
    device_online: true,
  };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('one trend per device without NEXT_PUBLIC_DEVICE_ID (AUDIT R6)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resets the trend history when the snapshot device_id changes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(reading('WEB-1', 1, 21)))
      .mockResolvedValueOnce(ok(reading('WEB-1', 2, 22)))
      .mockResolvedValueOnce(ok(reading('WEB-2', 3, 35)))
      .mockResolvedValueOnce(ok(reading('WEB-1', 4, 23)))
      .mockResolvedValue(ok(reading('WEB-1', 5, 24)));
    const source = new ApiTelemetrySource('http://api.test', { intervalMs: 1_000, fetcher });
    const emitted: DashboardSnapshot[] = [];
    source.subscribe((snapshot) => emitted.push(snapshot));
    await source.getInitialSnapshot();
    source.start();
    await vi.advanceTimersByTimeAsync(4_000);
    source.stop();

    const temps = (snapshot: DashboardSnapshot) =>
      snapshot.history.map((point) => point.air_temperature_c?.filtered);
    const byDevice = emitted.map((snapshot) => [snapshot.telemetry.device_id, temps(snapshot)]);
    expect(byDevice).toEqual([
      ['WEB-1', [21, 22]],
      ['WEB-2', [35]],
      ['WEB-1', [23]],
      ['WEB-1', [23, 24]],
    ]);
  });

  it('warns at build time when NEXT_PUBLIC_DEVICE_ID is empty', () => {
    expect(checkDeviceId({})).toMatch(/NEXT_PUBLIC_DEVICE_ID/);
    expect(checkDeviceId({ NEXT_PUBLIC_DEVICE_ID: '  ' })).toMatch(/NEXT_PUBLIC_DEVICE_ID/);
    expect(checkDeviceId({ NEXT_PUBLIC_DEVICE_ID: 'AGRONOVA-ESP32-01' })).toBeNull();
  });
});

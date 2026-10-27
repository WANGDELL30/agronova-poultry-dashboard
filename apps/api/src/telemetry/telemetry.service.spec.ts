import { validTelemetryV1Example } from '@agronova/telemetry-schema';
import { afterEach, describe, expect, it } from 'vitest';

import { TelemetryService } from './telemetry.service.js';

describe('TelemetryService', () => {
  const previousThreshold = process.env.DEVICE_OFFLINE_AFTER_MS;

  afterEach(() => {
    if (previousThreshold === undefined) delete process.env.DEVICE_OFFLINE_AFTER_MS;
    else process.env.DEVICE_OFFLINE_AFTER_MS = previousThreshold;
  });

  it('returns no reading until a device sends valid telemetry', () => {
    expect(new TelemetryService().latest()).toBeNull();
  });

  it('preserves captured_at separately from backend receive timestamps', () => {
    const service = new TelemetryService();
    const receivedAt = new Date('2026-10-27T04:00:05.000Z');
    const receipt = service.ingest(validTelemetryV1Example, receivedAt);

    expect(receipt.telemetry.captured_at).toBe('2026-01-01T00:00:00.000Z');
    expect(receipt.received_at).toBe('2026-10-27T04:00:05.000Z');
    expect(receipt.last_seen_at).toBe('2026-10-27T04:00:05.000Z');
    expect(receipt.telemetry.readings.ammonia_adc).toBeNull();
  });

  it('derives online state from last_seen_at', () => {
    process.env.DEVICE_OFFLINE_AFTER_MS = '30000';
    const service = new TelemetryService();
    service.ingest(validTelemetryV1Example, new Date('2026-10-27T04:00:00.000Z'));

    expect(service.latest(undefined, new Date('2026-10-27T04:00:29.000Z'))?.device_online).toBe(
      true,
    );
    expect(service.latest(undefined, new Date('2026-10-27T04:00:31.000Z'))?.device_online).toBe(
      false,
    );
    expect(
      service.latest(undefined, new Date('2026-10-27T04:00:31.000Z'))?.telemetry.quality
        .air_temperature,
    ).toBe('DEVICE_OFFLINE');
  });
});

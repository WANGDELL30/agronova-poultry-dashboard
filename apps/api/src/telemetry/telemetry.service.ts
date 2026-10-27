import { Injectable } from '@nestjs/common';
import {
  SensorQuality,
  type TelemetryReceiptV1,
  type TelemetryV1,
} from '@agronova/telemetry-schema';

interface StoredTelemetry {
  telemetry: TelemetryV1;
  receivedAt: string;
  lastSeenAt: string;
}

@Injectable()
export class TelemetryService {
  private readonly latestByDevice = new Map<string, StoredTelemetry>();
  private readonly offlineAfterMs: number;

  constructor() {
    const configured = Number(process.env.DEVICE_OFFLINE_AFTER_MS ?? '30000');
    if (!Number.isInteger(configured) || configured < 1_000) {
      throw new Error('DEVICE_OFFLINE_AFTER_MS must be an integer of at least 1000 milliseconds.');
    }
    this.offlineAfterMs = configured;
  }

  ingest(telemetry: TelemetryV1, receivedAt = new Date()): TelemetryReceiptV1 {
    const timestamp = receivedAt.toISOString();
    const stored = { telemetry, receivedAt: timestamp, lastSeenAt: timestamp };
    this.latestByDevice.set(telemetry.device_id, stored);
    return this.toReceipt(stored, receivedAt);
  }

  latest(deviceId?: string, now = new Date()): TelemetryReceiptV1 | null {
    const stored = deviceId ? this.latestByDevice.get(deviceId) : this.newest();
    return stored ? this.toReceipt(stored, now) : null;
  }

  private newest(): StoredTelemetry | undefined {
    return [...this.latestByDevice.values()].sort((a, b) =>
      b.receivedAt.localeCompare(a.receivedAt),
    )[0];
  }

  private toReceipt(stored: StoredTelemetry, now: Date): TelemetryReceiptV1 {
    const deviceOnline =
      now.getTime() - new Date(stored.lastSeenAt).getTime() <= this.offlineAfterMs;
    const offlineQuality = (quality: SensorQuality): SensorQuality =>
      quality === SensorQuality.NOT_INSTALLED ? quality : SensorQuality.DEVICE_OFFLINE;
    const telemetry = deviceOnline
      ? stored.telemetry
      : {
          ...stored.telemetry,
          quality: {
            overall: SensorQuality.DEVICE_OFFLINE,
            air_temperature: offlineQuality(stored.telemetry.quality.air_temperature),
            air_humidity: offlineQuality(stored.telemetry.quality.air_humidity),
            water_temperature: offlineQuality(stored.telemetry.quality.water_temperature),
            mq5: offlineQuality(stored.telemetry.quality.mq5),
            ammonia: offlineQuality(stored.telemetry.quality.ammonia),
            water_flow: offlineQuality(stored.telemetry.quality.water_flow),
            feed_weight: offlineQuality(stored.telemetry.quality.feed_weight),
          },
        };
    return {
      telemetry,
      received_at: stored.receivedAt,
      last_seen_at: stored.lastSeenAt,
      device_online: deviceOnline,
    };
  }
}

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

/** message_ids kept per device to recognise retransmissions; older ones are forgotten (R5). */
export const MESSAGE_IDS_REMEMBERED_PER_DEVICE = 1000;

/** Same message_id, different payload: never overwrite what was stored (R5). */
export class DuplicateMessageIdError extends Error {
  constructor(readonly messageId: string) {
    super(`message_id ${messageId} was already received with a different payload.`);
  }
}

interface SeenMessage {
  payload: string;
  stored: StoredTelemetry;
}

@Injectable()
export class TelemetryService {
  private readonly latestByDevice = new Map<string, StoredTelemetry>();
  /** Per device, insertion-ordered so the oldest id is evicted first. */
  private readonly seenByDevice = new Map<string, Map<string, SeenMessage>>();
  private readonly offlineAfterMs: number;

  constructor() {
    const configured = Number(process.env.DEVICE_OFFLINE_AFTER_MS ?? '30000');
    if (!Number.isInteger(configured) || configured < 1_000) {
      throw new Error('DEVICE_OFFLINE_AFTER_MS must be an integer of at least 1000 milliseconds.');
    }
    this.offlineAfterMs = configured;
  }

  ingest(telemetry: TelemetryV1, receivedAt = new Date()): TelemetryReceiptV1 {
    return this.ingestOrReplay(telemetry, receivedAt).receipt;
  }

  /**
   * Idempotent per `message_id` (AUDIT R5): a retransmission with the identical payload returns the
   * original receipt and leaves the latest reading alone; the same id with another payload throws
   * DuplicateMessageIdError.
   */
  ingestOrReplay(
    telemetry: TelemetryV1,
    receivedAt = new Date(),
  ): { receipt: TelemetryReceiptV1; replayed: boolean } {
    const payload = JSON.stringify(telemetry);
    let seen = this.seenByDevice.get(telemetry.device_id);
    const previous = seen?.get(telemetry.message_id);
    if (previous) {
      if (previous.payload !== payload) throw new DuplicateMessageIdError(telemetry.message_id);
      return { receipt: this.toReceipt(previous.stored, receivedAt), replayed: true };
    }
    const timestamp = receivedAt.toISOString();
    const stored = { telemetry, receivedAt: timestamp, lastSeenAt: timestamp };
    this.latestByDevice.set(telemetry.device_id, stored);
    if (!seen) {
      seen = new Map();
      this.seenByDevice.set(telemetry.device_id, seen);
    }
    seen.set(telemetry.message_id, { payload, stored });
    if (seen.size > MESSAGE_IDS_REMEMBERED_PER_DEVICE) {
      seen.delete(seen.keys().next().value as string);
    }
    return { receipt: this.toReceipt(stored, receivedAt), replayed: false };
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

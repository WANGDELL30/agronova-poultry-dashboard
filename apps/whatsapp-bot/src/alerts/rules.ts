import { SensorQuality, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';

import type { Thresholds } from '../config.js';
import {
  formatTime,
  latestPerCamera,
  qualityText,
  type KandangSnapshot,
} from '../agronova/snapshot.js';

export interface Condition {
  /** Stable identity of the condition; the watcher warns once per key while it stays active. */
  key: string;
  /** Sent when the condition becomes active. */
  text: string;
  /** Sent when the condition ends. Absent = end silently. */
  recoveryText?: string;
  /**
   * Set for conditions read from one device's telemetry. Such a condition can only be seen to end
   * in a reading from that same device: "no reading held" (for example after an API restart) is
   * not evidence that the device recovered.
   */
  deviceId?: string;
}

const SENSOR_LABELS = {
  air_temperature: 'suhu udara',
  air_humidity: 'kelembapan udara',
  water_temperature: 'suhu air',
  mq5: 'gas MQ-5',
  ammonia: 'amonia',
  water_flow: 'aliran air',
  feed_weight: 'berat pakan',
} as const;

function sensorConditions(receipt: TelemetryReceiptV1): Condition[] {
  const { telemetry } = receipt;
  const conditions: Condition[] = [];
  for (const [name, label] of Object.entries(SENSOR_LABELS)) {
    const quality = telemetry.quality[name as keyof typeof SENSOR_LABELS];
    if (quality !== SensorQuality.DISCONNECTED && quality !== SensorQuality.INVALID) continue;
    conditions.push({
      key: `sensor:${telemetry.device_id}:${name}`,
      deviceId: telemetry.device_id,
      text: `Sensor ${label} pada perangkat ${telemetry.device_id} bermasalah: ${qualityText(quality)}. Nilainya tidak dapat dipakai sampai sensor diperiksa.`,
    });
  }
  return conditions;
}

/**
 * Thresholds are off unless the farm owner configured them. Only a VALID reading is compared: a
 * missing, stale or uncalibrated value never raises (or clears) a threshold warning.
 */
function thresholdConditions(receipt: TelemetryReceiptV1, thresholds: Thresholds): Condition[] {
  const { telemetry } = receipt;
  const conditions: Condition[] = [];
  const check = (
    id: string,
    label: string,
    unit: string,
    value: number | null,
    quality: SensorQuality,
    max: number | null,
    min: number | null,
  ) => {
    if (value === null || quality !== SensorQuality.VALID) return;
    if (max !== null && value > max) {
      conditions.push({
        key: `threshold:${telemetry.device_id}:${id}:high`,
        deviceId: telemetry.device_id,
        text: `${label} ${value.toFixed(1)} ${unit} melebihi batas atas ${max} ${unit} (perangkat ${telemetry.device_id}).`,
        recoveryText: `${label} kembali di bawah batas atas ${max} ${unit} (perangkat ${telemetry.device_id}).`,
      });
    }
    if (min !== null && value < min) {
      conditions.push({
        key: `threshold:${telemetry.device_id}:${id}:low`,
        deviceId: telemetry.device_id,
        text: `${label} ${value.toFixed(1)} ${unit} di bawah batas bawah ${min} ${unit} (perangkat ${telemetry.device_id}).`,
        recoveryText: `${label} kembali di atas batas bawah ${min} ${unit} (perangkat ${telemetry.device_id}).`,
      });
    }
  };
  check(
    'air_temperature',
    'Suhu udara',
    '°C',
    telemetry.readings.air_temperature_c?.filtered ?? null,
    telemetry.quality.air_temperature,
    thresholds.tempMaxC,
    thresholds.tempMinC,
  );
  check(
    'air_humidity',
    'Kelembapan udara',
    '%',
    telemetry.readings.air_humidity_pct?.filtered ?? null,
    telemetry.quality.air_humidity,
    thresholds.humidityMaxPct,
    thresholds.humidityMinPct,
  );
  return conditions;
}

/**
 * Everything worth a warning in one reachable snapshot. Pure: the watcher decides what is new.
 * Must not be called for an unreachable snapshot, where nothing is known.
 */
export function activeConditions(
  snapshot: KandangSnapshot,
  thresholds: Thresholds,
  timeZone: string,
): Condition[] {
  const conditions: Condition[] = [];
  const receipt = snapshot.telemetry;
  if (receipt) {
    const deviceId = receipt.telemetry.device_id;
    if (!receipt.device_online) {
      conditions.push({
        key: `device-offline:${deviceId}`,
        deviceId,
        text: `Perangkat ${deviceId} OFFLINE. Terakhir terlihat ${formatTime(receipt.last_seen_at, timeZone)}. Data sensor tidak diperbarui sampai perangkat kembali terhubung.`,
        recoveryText: `Perangkat ${deviceId} kembali ONLINE.`,
      });
    } else {
      // While offline the API reports every sensor as DEVICE_OFFLINE, so these only apply online.
      conditions.push(...sensorConditions(receipt), ...thresholdConditions(receipt, thresholds));
    }
  }
  for (const result of latestPerCamera(snapshot.vision)) {
    if (!result.vote.trigger_alert) continue;
    const where = result.kandang_id ? ` (kandang ${result.kandang_id})` : '';
    const mock =
      result.inference_mode === 'mock' ? ' Catatan: mode mock, bukan hasil model sungguhan.' : '';
    conditions.push({
      key: `vision-alert:${result.camera_id}`,
      text: `Kamera ${result.camera_id}${where}: ${result.vote.majority_count ?? '?'} dari ${result.vote.window_size} frame terakhir terindikasi stres. Ini pendukung keputusan, bukan diagnosis; mohon periksa ayam secara langsung.${mock}`,
    });
  }
  return conditions;
}

export const API_UNREACHABLE: Condition = {
  key: 'api-unreachable',
  text: 'Bot tidak dapat menghubungi API AgroNova. Peringatan sensor dan kamera tidak dapat dipantau sampai API kembali.',
  recoveryText: 'API AgroNova kembali dapat dihubungi. Pemantauan berjalan lagi.',
};

import type { TelemetryCalibration, TelemetryQuality } from '@agronova/telemetry-schema';

import { isDeviceOnline } from './freshness';
import type { DashboardSnapshot } from './types';

const QUALITY_KEYS: Array<keyof TelemetryQuality> = [
  'overall',
  'air_temperature',
  'air_humidity',
  'water_temperature',
  'mq5',
  'ammonia',
  'water_flow',
  'feed_weight',
];
const CALIBRATION_KEYS: Array<keyof TelemetryCalibration> = ['ds18b20', 'mq5', 'dht22'];

/**
 * Strings starting with `= + - @ \t \r` get a `'` prefix so a spreadsheet does not run them as a
 * formula (`device_id` is free text from an unauthenticated endpoint). Numbers are left alone, so
 * `-40` stays numeric.
 */
function escapeCsv(value: string | number | null) {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createSnapshotCsv(snapshot: DashboardSnapshot, now: number) {
  const { telemetry } = snapshot;
  const headers = [
    'schema_version',
    'message_id',
    'device_id',
    'sequence_no',
    'captured_at',
    'received_at',
    'last_seen_at',
    'device_online',
    'air_temperature_raw_c',
    'air_temperature_filtered_c',
    'air_humidity_raw_pct',
    'air_humidity_filtered_pct',
    'water_temperature_raw_c',
    'water_temperature_filtered_c',
    'mq5_raw_adc',
    'mq5_filtered_adc',
    'mq5_adc_voltage_v',
    'mq5_relative_level_pct',
    'ammonia_adc',
    'water_flow_l_min',
    'water_total_l',
    'feed_weight_kg',
    ...QUALITY_KEYS.map((key) => `quality_${key}`),
    ...CALIBRATION_KEYS.map((key) => `calibration_${key}`),
  ];
  const values: Array<string | number | null> = [
    telemetry.schema_version,
    telemetry.message_id,
    telemetry.device_id,
    telemetry.sequence_no,
    telemetry.captured_at,
    snapshot.received_at,
    snapshot.last_seen_at,
    String(isDeviceOnline(snapshot, now)),
    telemetry.readings.air_temperature_c?.raw ?? null,
    telemetry.readings.air_temperature_c?.filtered ?? null,
    telemetry.readings.air_humidity_pct?.raw ?? null,
    telemetry.readings.air_humidity_pct?.filtered ?? null,
    telemetry.readings.water_temperature_c?.raw ?? null,
    telemetry.readings.water_temperature_c?.filtered ?? null,
    telemetry.readings.mq5?.raw_adc ?? null,
    telemetry.readings.mq5?.filtered_adc ?? null,
    telemetry.readings.mq5?.adc_voltage_v ?? null,
    telemetry.readings.mq5?.relative_level_pct ?? null,
    telemetry.readings.ammonia_adc,
    telemetry.readings.water_flow_l_min,
    telemetry.readings.water_total_l,
    telemetry.readings.feed_weight_kg,
    ...QUALITY_KEYS.map((key) => telemetry.quality[key]),
    ...CALIBRATION_KEYS.map((key) => telemetry.calibration[key]),
  ];
  return `${headers.join(',')}\n${values.map(escapeCsv).join(',')}\n`;
}

/** `device_online` is the status the UI shows (re-checked against the clock), not the API's. */
export function createSnapshotJson(snapshot: DashboardSnapshot, now: number) {
  return JSON.stringify(
    {
      exported_at: new Date(now).toISOString(),
      telemetry: snapshot.telemetry,
      received_at: snapshot.received_at,
      last_seen_at: snapshot.last_seen_at,
      device_online: isDeviceOnline(snapshot, now),
    },
    null,
    2,
  );
}

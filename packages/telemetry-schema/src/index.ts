import { z } from 'zod';

export const TELEMETRY_SCHEMA_VERSION = 1 as const;

export enum SensorQuality {
  NOT_INSTALLED = 'NOT_INSTALLED',
  DISCONNECTED = 'DISCONNECTED',
  INVALID = 'INVALID',
  STALE = 'STALE',
  CALIBRATING = 'CALIBRATING',
  VALID = 'VALID',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  UNKNOWN = 'UNKNOWN',
}

export enum CalibrationStatus {
  UNCALIBRATED = 'UNCALIBRATED',
  IN_PROGRESS = 'IN_PROGRESS',
  CALIBRATED = 'CALIBRATED',
  FAILED = 'FAILED',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export const SENSOR_QUALITY_VALUES = Object.freeze(Object.values(SensorQuality));
export const CALIBRATION_STATUS_VALUES = Object.freeze(Object.values(CalibrationStatus));

export const sensorQualitySchema = z.enum(SensorQuality);
export const calibrationStatusSchema = z.enum(CalibrationStatus);

/**
 * UTC ISO 8601 with a `Z` suffix and seconds (`2026-01-01T00:00:00Z`, fractions allowed); an offset or
 * a time without seconds is rejected (zod 4; zod 3 still accepted `T00:00Z`, AUDIT S23).
 */
const utcTimestamp = z.iso.datetime({ offset: false });

/**
 * Any 8-4-4-4-12 hex id, as zod 3 accepted (AUDIT S23). `z.uuid()` in zod 4 also checks the RFC 9562
 * version and variant bits; firmware that fills message_id with random hex would then be rejected.
 */
const messageId = z.guid();

// Numbers in zod 4 reject Infinity and NaN by default (`.finite()` is a no-op there). `.int()` also
// requires a safe integer (at most 2^53 - 1).
const rawAndFilteredReadingSchema = z
  .object({
    raw: z.number(),
    filtered: z.number(),
  })
  .strict();

const mq5ReadingSchema = z
  .object({
    raw_adc: z.number().int().min(0).max(4095),
    filtered_adc: z.number().int().min(0).max(4095),
    adc_voltage_v: z.number().nonnegative(),
    relative_level_pct: z.number().min(0).max(100),
  })
  .strict();

export const telemetryV1Schema = z
  .object({
    schema_version: z.literal(TELEMETRY_SCHEMA_VERSION),
    message_id: messageId,
    device_id: z.string().trim().min(1).max(128),
    sequence_no: z.number().int().nonnegative(),
    captured_at: utcTimestamp,
    device: z
      .object({
        firmware_version: z.string().trim().min(1),
        uptime_s: z.number().int().nonnegative(),
        wifi_rssi_dbm: z.number().int().max(0),
      })
      .strict(),
    readings: z
      .object({
        air_temperature_c: rawAndFilteredReadingSchema.nullable(),
        air_humidity_pct: rawAndFilteredReadingSchema.nullable(),
        water_temperature_c: rawAndFilteredReadingSchema.nullable(),
        mq5: mq5ReadingSchema.nullable(),
        ammonia_adc: z.number().int().nonnegative().nullable(),
        water_flow_l_min: z.number().nonnegative().nullable(),
        water_total_l: z.number().nonnegative().nullable(),
        feed_weight_kg: z.number().nonnegative().nullable(),
      })
      .strict(),
    quality: z
      .object({
        overall: sensorQualitySchema,
        air_temperature: sensorQualitySchema,
        air_humidity: sensorQualitySchema,
        water_temperature: sensorQualitySchema,
        mq5: sensorQualitySchema,
        ammonia: sensorQualitySchema,
        water_flow: sensorQualitySchema,
        feed_weight: sensorQualitySchema,
      })
      .strict(),
    calibration: z
      .object({
        ds18b20: calibrationStatusSchema,
        mq5: calibrationStatusSchema,
        dht22: calibrationStatusSchema,
      })
      .strict(),
  })
  .strict();

export const telemetryReceiptV1Schema = z
  .object({
    telemetry: telemetryV1Schema,
    received_at: utcTimestamp,
    last_seen_at: utcTimestamp,
    device_online: z.boolean(),
  })
  .strict();

export type TelemetryV1 = z.infer<typeof telemetryV1Schema>;
export type TelemetryReceiptV1 = z.infer<typeof telemetryReceiptV1Schema>;
export type TelemetryDevice = TelemetryV1['device'];
export type TelemetryReadings = TelemetryV1['readings'];
export type TelemetryQuality = TelemetryV1['quality'];
export type TelemetryCalibration = TelemetryV1['calibration'];

export const validTelemetryV1Example = {
  schema_version: TELEMETRY_SCHEMA_VERSION,
  message_id: 'b9f4f59a-64af-4ef8-a477-87f62e398dd7',
  device_id: 'AGRONOVA-ESP32-01',
  sequence_no: 1,
  captured_at: '2026-01-01T00:00:00.000Z',
  device: {
    firmware_version: '0.1.0',
    uptime_s: 100,
    wifi_rssi_dbm: -61,
  },
  readings: {
    air_temperature_c: {
      raw: 28.7,
      filtered: 28.5,
    },
    air_humidity_pct: {
      raw: 73.1,
      filtered: 72.4,
    },
    water_temperature_c: {
      raw: 26.9,
      filtered: 26.8,
    },
    mq5: {
      raw_adc: 1304,
      filtered_adc: 1289,
      adc_voltage_v: 0.5,
      relative_level_pct: 31.5,
    },
    ammonia_adc: null,
    water_flow_l_min: null,
    water_total_l: null,
    feed_weight_kg: null,
  },
  quality: {
    overall: SensorQuality.VALID,
    air_temperature: SensorQuality.VALID,
    air_humidity: SensorQuality.VALID,
    water_temperature: SensorQuality.VALID,
    mq5: SensorQuality.VALID,
    ammonia: SensorQuality.NOT_INSTALLED,
    water_flow: SensorQuality.NOT_INSTALLED,
    feed_weight: SensorQuality.NOT_INSTALLED,
  },
  calibration: {
    ds18b20: CalibrationStatus.IN_PROGRESS,
    mq5: CalibrationStatus.IN_PROGRESS,
    dht22: CalibrationStatus.UNCALIBRATED,
  },
} satisfies TelemetryV1;

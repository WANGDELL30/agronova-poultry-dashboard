import { SensorQuality, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import type { VisionResultV1 } from '@agronova/vision-schema';

import { AgronovaApiError, type AgronovaApiClient } from './api-client.js';

export interface KandangSnapshot {
  /** False when the API could not be read; telemetry and vision are then unknown, not empty. */
  apiReachable: boolean;
  telemetry: TelemetryReceiptV1 | null;
  /** Newest first. */
  vision: VisionResultV1[];
  fetchedAt: Date;
}

export async function fetchSnapshot(
  client: AgronovaApiClient,
  deviceId: string | null,
  now: () => Date = () => new Date(),
): Promise<KandangSnapshot> {
  try {
    const [telemetry, vision] = await Promise.all([
      client.latestTelemetry(deviceId),
      client.visionResults(),
    ]);
    return { apiReachable: true, telemetry, vision, fetchedAt: now() };
  } catch (error) {
    if (!(error instanceof AgronovaApiError)) throw error;
    return { apiReachable: false, telemetry: null, vision: [], fetchedAt: now() };
  }
}

/** UTC is stored; the farm's time zone is used for display only. */
export function formatTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

const QUALITY_TEXT: Record<SensorQuality, string> = {
  [SensorQuality.NOT_INSTALLED]: 'sensor belum terpasang',
  [SensorQuality.DISCONNECTED]: 'sensor terputus',
  [SensorQuality.INVALID]: 'pembacaan tidak valid',
  [SensorQuality.STALE]: 'data basi',
  [SensorQuality.CALIBRATING]: 'sensor sedang kalibrasi',
  [SensorQuality.VALID]: 'valid',
  [SensorQuality.DEVICE_OFFLINE]: 'perangkat offline',
  [SensorQuality.UNKNOWN]: 'status tidak diketahui',
};

export function qualityText(quality: SensorQuality): string {
  return QUALITY_TEXT[quality];
}

/**
 * One reading as text. A value is shown only when it exists; a missing value is reported as
 * missing with its status, never as zero. Values held from before the device went offline are
 * labelled as old.
 */
function readingLine(label: string, value: string | null, quality: SensorQuality): string {
  if (value === null) return `- ${label}: tidak ada nilai (${qualityText(quality)})`;
  switch (quality) {
    case SensorQuality.VALID:
      return `- ${label}: ${value}`;
    case SensorQuality.DEVICE_OFFLINE:
      return `- ${label}: ${value} (nilai terakhir sebelum perangkat offline, bukan kondisi saat ini)`;
    case SensorQuality.CALIBRATING:
    case SensorQuality.STALE:
      return `- ${label}: ${value} (${qualityText(quality)}, belum tentu akurat)`;
    default:
      // DISCONNECTED, INVALID, NOT_INSTALLED, UNKNOWN: a number here cannot be trusted.
      return `- ${label}: tidak ada nilai yang dapat dipakai (${qualityText(quality)})`;
  }
}

const fixed = (value: number, digits: number) => value.toFixed(digits);

function telemetryLines(receipt: TelemetryReceiptV1, timeZone: string): string[] {
  const { telemetry } = receipt;
  const { readings, quality } = telemetry;
  const lines = [
    `Perangkat ${telemetry.device_id}: ${receipt.device_online ? 'ONLINE' : 'OFFLINE'}`,
    `- Terakhir terlihat: ${formatTime(receipt.last_seen_at, timeZone)}`,
    `- Waktu pembacaan di perangkat: ${formatTime(telemetry.captured_at, timeZone)}`,
    readingLine(
      'Suhu udara',
      readings.air_temperature_c ? `${fixed(readings.air_temperature_c.filtered, 1)} °C` : null,
      quality.air_temperature,
    ),
    readingLine(
      'Kelembapan udara',
      readings.air_humidity_pct ? `${fixed(readings.air_humidity_pct.filtered, 1)} %` : null,
      quality.air_humidity,
    ),
    readingLine(
      'Suhu air',
      readings.water_temperature_c ? `${fixed(readings.water_temperature_c.filtered, 1)} °C` : null,
      quality.water_temperature,
    ),
    // MQ-5 is uncalibrated: relative level, ADC and voltage only. Never a ppm value.
    readingLine(
      'Gas MQ-5 (belum dikalibrasi, bukan ppm)',
      readings.mq5
        ? `level relatif ${fixed(readings.mq5.relative_level_pct, 1)} %, ADC terfilter ${readings.mq5.filtered_adc}, tegangan ${fixed(readings.mq5.adc_voltage_v, 2)} V`
        : null,
      quality.mq5,
    ),
    readingLine(
      'Amonia (ADC mentah, bukan konsentrasi)',
      readings.ammonia_adc !== null ? String(readings.ammonia_adc) : null,
      quality.ammonia,
    ),
    readingLine(
      'Aliran air',
      readings.water_flow_l_min !== null
        ? `${fixed(readings.water_flow_l_min, 2)} L/menit${
            readings.water_total_l !== null ? `, total ${fixed(readings.water_total_l, 1)} L` : ''
          }`
        : null,
      quality.water_flow,
    ),
    readingLine(
      'Berat pakan',
      readings.feed_weight_kg !== null ? `${fixed(readings.feed_weight_kg, 2)} kg` : null,
      quality.feed_weight,
    ),
  ];
  return lines;
}

/**
 * Newest camera result per camera, in the order the cameras first appear (newest first). Manual test
 * uploads from the dashboard are skipped: they say nothing about the house and never vote (S2), so
 * they must neither be reported as the camera's state nor hide the camera's real latest frame.
 */
export function latestPerCamera(results: readonly VisionResultV1[]): VisionResultV1[] {
  const seen = new Set<string>();
  const latest: VisionResultV1[] = [];
  for (const result of results) {
    if (result.source === 'manual' || seen.has(result.camera_id)) continue;
    seen.add(result.camera_id);
    latest.push(result);
  }
  return latest;
}

/**
 * A frame without a classification is described as "not assessed". It is never worded as
 * "not stressed": skipped_quality, parse_error, inference_error and label `undefined` say nothing
 * about the birds.
 */
export function visionStatusText(result: VisionResultV1): string {
  if (result.status === 'skipped_quality') {
    const issues = result.quality?.issues.join(', ');
    return `frame tidak dinilai karena kualitas gambar${issues ? ` (${issues})` : ''}; ini bukan berarti tidak stres`;
  }
  if (result.status === 'parse_error') {
    return 'frame tidak dinilai karena jawaban model tidak terbaca; ini bukan berarti tidak stres';
  }
  if (result.status === 'inference_error' || result.result === null) {
    return 'frame tidak dinilai karena inferensi gagal; ini bukan berarti tidak stres';
  }
  const { label, total_ya: totalYa, visible_count: visible } = result.result;
  if (label === 'undefined') {
    return `tidak dapat dinilai (hanya ${visible} dari 7 indikator terlihat); ini bukan berarti tidak stres`;
  }
  return label === 'stress'
    ? `terindikasi stres (${totalYa} dari 7 indikator bernilai YA)`
    : `tidak terindikasi stres (${totalYa} dari 7 indikator bernilai YA)`;
}

export function voteText(result: VisionResultV1): string {
  const { vote } = result;
  switch (vote.status) {
    case 'alert':
      return `ALERT: ${vote.majority_count ?? '?'} dari ${vote.window_size} frame terakhir terindikasi stres`;
    case 'no_alert':
      return `tidak ada alert pada ${vote.window_size} frame terakhir`;
    case 'waiting_window':
      return `menunggu jendela voting penuh (${vote.window_filled}/${vote.window_size})`;
    default:
      return 'frame ini tidak ikut voting';
  }
}

function visionLines(results: readonly VisionResultV1[], timeZone: string): string[] {
  const cameras = latestPerCamera(results);
  if (cameras.length === 0) return ['Deteksi stres (kamera): belum ada hasil.'];
  const lines = ['Deteksi stres dari kamera (pendukung keputusan untuk petugas, bukan diagnosis):'];
  for (const result of cameras) {
    const where = result.kandang_id ? `, kandang ${result.kandang_id}` : '';
    const mock =
      result.inference_mode === 'mock' ? ' [mode mock: bukan hasil model sungguhan]' : '';
    lines.push(
      `- Kamera ${result.camera_id}${where}: ${visionStatusText(result)}. Voting: ${voteText(result)}. Frame diterima ${formatTime(result.received_at, timeZone)}.${mock}`,
    );
  }
  return lines;
}

/**
 * Plain-text status used both as the LLM's only source of facts and as the reply when the LLM is
 * not configured or fails.
 */
export function describeSnapshot(snapshot: KandangSnapshot, timeZone: string): string {
  const header = `Data diambil ${formatTime(snapshot.fetchedAt, timeZone)}.`;
  if (!snapshot.apiReachable) {
    return `${header}\nAPI AgroNova tidak dapat dihubungi, jadi kondisi kandang saat ini tidak diketahui.`;
  }
  const sensor = snapshot.telemetry
    ? telemetryLines(snapshot.telemetry, timeZone)
    : ['Sensor: API belum menerima pembacaan apa pun dari perangkat.'];
  return [header, ...sensor, ...visionLines(snapshot.vision, timeZone)].join('\n');
}

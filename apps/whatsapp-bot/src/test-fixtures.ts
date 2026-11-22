import {
  SensorQuality,
  validTelemetryV1Example,
  type TelemetryReceiptV1,
  type TelemetryV1,
} from '@agronova/telemetry-schema';
import type { VisionResultV1 } from '@agronova/vision-schema';

import type { KandangSnapshot } from './agronova/snapshot.js';
import type { Thresholds } from './config.js';
import type { WhatsAppProvider } from './whatsapp/provider.js';

export const TIME_ZONE = 'Asia/Jakarta';
export const NOW = new Date('2026-11-17T03:00:00.000Z');
export const NO_THRESHOLDS: Thresholds = {
  tempMaxC: null,
  tempMinC: null,
  humidityMaxPct: null,
  humidityMinPct: null,
};

export function receipt(
  overrides: {
    online?: boolean;
    quality?: Partial<TelemetryV1['quality']>;
    readings?: Partial<TelemetryV1['readings']>;
    deviceId?: string;
  } = {},
): TelemetryReceiptV1 {
  const online = overrides.online ?? true;
  const base: TelemetryV1 = structuredClone(validTelemetryV1Example);
  const quality = { ...base.quality, ...overrides.quality };
  return {
    telemetry: {
      ...base,
      device_id: overrides.deviceId ?? base.device_id,
      captured_at: '2026-11-17T02:59:50.000Z',
      readings: { ...base.readings, ...overrides.readings },
      // The API reports every installed sensor as DEVICE_OFFLINE once the device is offline.
      quality: online
        ? quality
        : (Object.fromEntries(
            Object.entries(quality).map(([name, value]) => [
              name,
              value === SensorQuality.NOT_INSTALLED ? value : SensorQuality.DEVICE_OFFLINE,
            ]),
          ) as TelemetryV1['quality']),
    },
    received_at: '2026-11-17T02:59:51.000Z',
    last_seen_at: '2026-11-17T02:59:51.000Z',
    device_online: online,
  };
}

let visionCounter = 0;

export function visionResult(
  kind: 'stress' | 'not_stress' | 'undefined' | 'skipped_quality' | 'inference_error',
  overrides: Partial<VisionResultV1> = {},
): VisionResultV1 {
  visionCounter += 1;
  const classified = kind === 'stress' || kind === 'not_stress' || kind === 'undefined';
  const totalYa = kind === 'stress' ? 4 : 1;
  const visible = kind === 'undefined' ? 3 : 7;
  return {
    schema_version: 1,
    message_id: `00000000-0000-4000-8000-${String(visionCounter).padStart(12, '0')}`,
    camera_id: 'CAM-01',
    kandang_id: 'K1',
    source: 'camera',
    captured_at: '2026-11-17T02:58:00.000Z',
    received_at: '2026-11-17T02:58:05.000Z',
    inference_mode: kind === 'inference_error' ? null : 'real',
    model:
      kind === 'inference_error'
        ? null
        : { base_model: 'base', adapter: 'adapter', adapter_revision: null },
    inference_ms: kind === 'inference_error' ? null : 9800,
    quality:
      kind === 'inference_error'
        ? null
        : kind === 'skipped_quality'
          ? { status: 'skipped', issues: ['blur'] }
          : { status: 'ok', issues: [] },
    status: classified ? 'classified' : kind,
    result: classified
      ? {
          indicators: {
            posisi_ekor: 'YA',
            posisi_kepala: 'TIDAK',
            penutupan_mata: 'TIDAK',
            pembukaan_paruh: 'TIDAK',
            posisi_sayap: 'TIDAK',
            postur_kaki: 'TIDAK',
            kondisi_bulu: 'TIDAK',
          },
          total_ya: kind === 'undefined' ? 1 : totalYa,
          visible_count: visible,
          label: kind,
          score_stress: totalYa / 7,
          confidence:
            kind === 'undefined' ? null : kind === 'stress' ? totalYa / 7 : 1 - totalYa / 7,
        }
      : null,
    raw_response: null,
    error_message: null,
    vote: {
      status: 'waiting_window',
      trigger_alert: false,
      window_size: 5,
      window_filled: 1,
      majority_label: null,
      majority_count: null,
    },
    image_available: true,
    ...overrides,
  };
}

export const ALERT_VOTE: VisionResultV1['vote'] = {
  status: 'alert',
  trigger_alert: true,
  window_size: 5,
  window_filled: 5,
  majority_label: 'stress',
  majority_count: 3,
};

export function snapshot(overrides: Partial<KandangSnapshot> = {}): KandangSnapshot {
  return { apiReachable: true, telemetry: receipt(), vision: [], fetchedAt: NOW, ...overrides };
}

export const UNREACHABLE: KandangSnapshot = {
  apiReachable: false,
  telemetry: null,
  vision: [],
  fetchedAt: NOW,
};

export interface SentMessage {
  kind: 'text' | 'template';
  to: string;
  body: string;
  template?: string;
}

export class RecordingProvider implements WhatsAppProvider {
  readonly sent: SentMessage[] = [];
  failFor: string | null = null;

  async sendText(to: string, body: string): Promise<void> {
    if (to === this.failFor) throw new Error('send failed');
    this.sent.push({ kind: 'text', to, body });
  }

  async sendTemplate(
    to: string,
    template: string,
    _languageCode: string,
    bodyParameters: readonly string[],
  ): Promise<void> {
    if (to === this.failFor) throw new Error('send failed');
    this.sent.push({ kind: 'template', to, body: bodyParameters.join('|'), template });
  }
}

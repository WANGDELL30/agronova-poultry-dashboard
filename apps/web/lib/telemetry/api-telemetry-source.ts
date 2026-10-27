import {
  CalibrationStatus,
  SensorQuality,
  telemetryReceiptV1Schema,
  type TelemetryReceiptV1,
} from '@agronova/telemetry-schema';

import {
  TelemetrySourceError,
  type DashboardAlert,
  type DashboardSnapshot,
  type TelemetrySource,
  type TrendPoint,
} from './types';

interface ApiTelemetrySourceOptions {
  deviceId?: string;
  intervalMs?: number;
  fetcher?: typeof fetch;
}

function toTrendPoint(receipt: TelemetryReceiptV1): TrendPoint {
  const { readings, captured_at } = receipt.telemetry;
  return {
    captured_at,
    air_temperature_c: readings.air_temperature_c,
    air_humidity_pct: readings.air_humidity_pct,
    water_temperature_c: readings.water_temperature_c,
    mq5_relative_level_pct: readings.mq5
      ? {
          raw: (readings.mq5.raw_adc / 4_095) * 100,
          filtered: readings.mq5.relative_level_pct,
        }
      : null,
  };
}

function createAlerts(
  receipt: TelemetryReceiptV1,
  acknowledgedIds: ReadonlySet<string>,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (!receipt.device_online) {
    alerts.push({
      id: 'device-offline',
      severity: 'warning',
      titleKey: 'alerts.deviceOfflineTitle',
      descriptionKey: 'alerts.deviceOfflineDescription',
      deviceId: receipt.telemetry.device_id,
      occurredAt: receipt.last_seen_at,
      acknowledged: acknowledgedIds.has('device-offline'),
    });
  }

  const calibrating = Object.values(receipt.telemetry.calibration).some(
    (status) => status === CalibrationStatus.IN_PROGRESS,
  );
  if (calibrating) {
    alerts.push({
      id: 'calibration-progress',
      severity: 'information',
      titleKey: 'alerts.calibrationTitle',
      descriptionKey: 'alerts.calibrationDescription',
      deviceId: receipt.telemetry.device_id,
      occurredAt: receipt.received_at,
      acknowledged: acknowledgedIds.has('calibration-progress'),
    });
  }
  return alerts;
}

function countQuality(receipt: TelemetryReceiptV1, quality: SensorQuality): number {
  const { overall: _overall, ...sensorQuality } = receipt.telemetry.quality;
  return Object.values(sensorQuality).filter((value) => value === quality).length;
}

export class ApiTelemetrySource implements TelemetrySource {
  readonly mode = 'api' as const;
  readonly scenario = null;

  private readonly endpoint: string;
  private readonly intervalMs: number;
  private readonly fetcher: typeof fetch;
  private readonly listeners = new Set<(snapshot: DashboardSnapshot) => void>();
  private readonly acknowledgedIds = new Set<string>();
  private history: TrendPoint[] = [];
  private lastMessageId: string | null = null;
  private current: DashboardSnapshot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(apiBaseUrl = '', options: ApiTelemetrySourceOptions = {}) {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const query = options.deviceId ? `?device_id=${encodeURIComponent(options.deviceId)}` : '';
    this.endpoint = `${base}/api/v1/telemetry/latest${query}`;
    this.intervalMs = options.intervalMs ?? 3_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async getInitialSnapshot(): Promise<DashboardSnapshot | null> {
    this.current = await this.fetchSnapshot();
    return this.current;
  }

  subscribe(listener: (snapshot: DashboardSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  acknowledgeAlert(alertId: string): void {
    this.acknowledgedIds.add(alertId);
    if (!this.current) return;
    this.current = {
      ...this.current,
      alerts: this.current.alerts.map((alert) =>
        alert.id === alertId ? { ...alert, acknowledged: true } : alert,
      ),
    };
    this.emit(this.current);
  }

  private async poll(): Promise<void> {
    try {
      const snapshot = await this.fetchSnapshot();
      if (snapshot) {
        this.current = snapshot;
        this.emit(snapshot);
      }
    } catch {
      // Keep the last verified reading visible. The next poll retries automatically.
    }
  }

  private async fetchSnapshot(): Promise<DashboardSnapshot | null> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, { cache: 'no-store' });
    } catch {
      throw new TelemetrySourceError('unavailable', 'Telemetry API is unreachable.');
    }

    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) {
      throw new TelemetrySourceError(
        'unavailable',
        `Telemetry API returned HTTP ${response.status}.`,
      );
    }

    const parsed = telemetryReceiptV1Schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new TelemetrySourceError('error', 'Telemetry API returned an invalid payload.');
    }
    const receipt = parsed.data;
    if (receipt.telemetry.message_id !== this.lastMessageId) {
      this.lastMessageId = receipt.telemetry.message_id;
      this.history = [...this.history, toTrendPoint(receipt)].slice(-288);
    }

    const { overall: _overall, ...sensorQuality } = receipt.telemetry.quality;
    const qualities = Object.values(sensorQuality);
    return {
      telemetry: receipt.telemetry,
      received_at: receipt.received_at,
      last_seen_at: receipt.last_seen_at,
      deviceOnline: receipt.device_online,
      history: this.history,
      alerts: createAlerts(receipt, this.acknowledgedIds),
      installedSensorCount: qualities.filter(
        (quality) => quality !== SensorQuality.NOT_INSTALLED && quality !== SensorQuality.UNKNOWN,
      ).length,
      calibratingSensorCount: Object.values(receipt.telemetry.calibration).filter(
        (status) => status === CalibrationStatus.IN_PROGRESS,
      ).length,
      disconnectedSensorCount: countQuality(receipt, SensorQuality.DISCONNECTED),
      scenario: null,
    };
  }

  private emit(snapshot: DashboardSnapshot): void {
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

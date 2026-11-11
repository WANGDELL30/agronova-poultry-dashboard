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
import { STALE_AFTER_FAILED_POLLS } from './freshness';
import { DEFAULT_LIVE_INTERVAL_MS } from './intervals';

interface ApiTelemetrySourceOptions {
  deviceId?: string;
  intervalMs?: number;
  /** A request still pending after this long is aborted. */
  requestTimeoutMs?: number;
  fetcher?: typeof fetch;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_HISTORY_POINTS = 288;

const capturedTime = (iso: string) => Date.parse(iso);

function toTrendPoint(receipt: TelemetryReceiptV1): TrendPoint {
  const { readings, captured_at, message_id } = receipt.telemetry;
  return {
    message_id,
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
  private readonly configured: boolean;
  private readonly intervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly fetcher: typeof fetch;
  private readonly listeners = new Set<(snapshot: DashboardSnapshot) => void>();
  private readonly acknowledgedIds = new Set<string>();
  private history: TrendPoint[] = [];
  private current: DashboardSnapshot | null = null;
  private failedPolls = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private inFlight: AbortController | null = null;

  constructor(apiBaseUrl = '', options: ApiTelemetrySourceOptions = {}) {
    const base = apiBaseUrl.trim().replace(/\/+$/, '');
    // An empty base would silently request the web app's own origin (AUDIT D4).
    this.configured = base !== '';
    const query = options.deviceId ? `?device_id=${encodeURIComponent(options.deviceId)}` : '';
    this.endpoint = `${base}/api/v1/telemetry/latest${query}`;
    this.intervalMs = options.intervalMs ?? DEFAULT_LIVE_INTERVAL_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    // Browsers reject fetch called with a non-global `this` ("Illegal invocation").
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  async getInitialSnapshot(): Promise<DashboardSnapshot | null> {
    const snapshot = await this.fetchSnapshot();
    if (snapshot) this.current = snapshot;
    return this.current;
  }

  subscribe(listener: (snapshot: DashboardSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Chained timeouts instead of setInterval: the next poll is only scheduled after the previous
   * one settled, so a slow network never stacks requests (AUDIT H4).
   */
  start(): void {
    if (this.running || !this.configured) return;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inFlight?.abort();
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll().finally(() => {
        if (this.running) this.schedule();
      });
    }, this.intervalMs);
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
    // The initial request may still be running; never run two at once.
    if (this.inFlight) return;
    try {
      const snapshot = await this.fetchSnapshot();
      this.failedPolls = 0;
      if (snapshot && snapshot !== this.current) {
        this.current = snapshot;
        this.emit(snapshot);
      } else if (this.current?.stale) {
        // Connection is back even though the reading itself did not change.
        this.current = { ...this.current, stale: false };
        this.emit(this.current);
      }
    } catch {
      // Keep the last reading visible, but flag it as stale after repeated failures.
      this.failedPolls += 1;
      if (this.failedPolls >= STALE_AFTER_FAILED_POLLS && this.current && !this.current.stale) {
        this.current = { ...this.current, stale: true };
        this.emit(this.current);
      }
    }
  }

  private async fetchSnapshot(): Promise<DashboardSnapshot | null> {
    if (!this.configured) {
      throw new TelemetrySourceError('unconfigured', 'NEXT_PUBLIC_API_BASE_URL is not set.');
    }
    const controller = new AbortController();
    this.inFlight = controller;
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await this.request(controller.signal);
    } finally {
      clearTimeout(timeout);
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  private async request(signal: AbortSignal): Promise<DashboardSnapshot | null> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, { cache: 'no-store', signal });
    } catch {
      throw new TelemetrySourceError(
        'unavailable',
        signal.aborted ? 'Telemetry API request timed out.' : 'Telemetry API is unreachable.',
      );
    }

    // Only 204 means "no reading yet"; a 404 usually means the URL points at the wrong host.
    if (response.status === 204) return null;
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
    const current = this.current?.telemetry;
    if (
      current &&
      current.device_id === receipt.telemetry.device_id &&
      capturedTime(receipt.telemetry.captured_at) < capturedTime(current.captured_at)
    ) {
      // A late or retransmitted older reading must not replace the one already shown.
      return this.current;
    }
    if (current && current.device_id !== receipt.telemetry.device_id) {
      // Without NEXT_PUBLIC_DEVICE_ID the latest reading may come from another device; one trend
      // line must never mix two devices (AUDIT R6).
      this.history = [];
    }
    this.addToHistory(toTrendPoint(receipt));

    const { overall: _overall, ...sensorQuality } = receipt.telemetry.quality;
    const qualities = Object.values(sensorQuality);
    return {
      telemetry: receipt.telemetry,
      received_at: receipt.received_at,
      last_seen_at: receipt.last_seen_at,
      deviceOnline: receipt.device_online,
      stale: false,
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

  /** One point per message_id, ordered by captured_at (AUDIT R5, web part). */
  private addToHistory(point: TrendPoint): void {
    if (this.history.some(({ message_id }) => message_id === point.message_id)) return;
    this.history = [...this.history, point]
      .sort((a, b) => capturedTime(a.captured_at) - capturedTime(b.captured_at))
      .slice(-MAX_HISTORY_POINTS);
  }

  private emit(snapshot: DashboardSnapshot): void {
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

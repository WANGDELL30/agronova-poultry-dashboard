import {
  CalibrationStatus,
  SensorQuality,
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryV1,
} from '@agronova/telemetry-schema';

import type {
  DashboardAlert,
  DashboardSnapshot,
  SimulationScenario,
  TelemetrySource,
  TrendPoint,
  TrendReading,
} from './types';

const DEVICE_ID = 'AGRONOVA-ESP32-01';
const INITIAL_SEQUENCE = 1_842;
const INITIAL_UPTIME_SECONDS = 18_452;

export interface MockTelemetrySourceOptions {
  scenario?: SimulationScenario;
  intervalMs?: number;
  initialDelayMs?: number;
  now?: () => Date;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createMessageId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function createTrendReading(
  rawBase: number,
  filteredBase: number,
  phase: number,
  amplitude: number,
  digits = 1,
): TrendReading {
  return {
    raw: round(rawBase + Math.sin(phase) * amplitude, digits),
    filtered: round(filteredBase + Math.sin(phase - 0.2) * amplitude * 0.72, digits),
  };
}

function createHistory(
  now: Date,
  step: number,
  scenario: SimulationScenario,
  telemetry: TelemetryV1,
): TrendPoint[] {
  const endTime = now.getTime() - 5_300;
  const points: TrendPoint[] = Array.from({ length: 25 }, (_, index) => {
    const phase = (step + index) * 0.47;
    const captured_at = new Date(endTime - (24 - index) * 60 * 60 * 1_000).toISOString();
    const humidityBoost = scenario === 'warning' ? 6.4 : 0;

    return {
      captured_at,
      air_temperature_c: createTrendReading(28.7, 28.5, phase, 1.1),
      air_humidity_pct: createTrendReading(73.1 + humidityBoost, 72.4 + humidityBoost, phase, 3.1),
      water_temperature_c:
        scenario === 'sensor-not-installed'
          ? null
          : createTrendReading(26.9, 26.8, phase * 0.68, 0.6),
      mq5_relative_level_pct: createTrendReading(33.1, 31.5, phase * 1.14, 4.2),
    };
  });

  const latest = points.at(-1);
  if (latest) {
    latest.air_temperature_c = telemetry.readings.air_temperature_c;
    latest.air_humidity_pct = telemetry.readings.air_humidity_pct;
    latest.water_temperature_c = telemetry.readings.water_temperature_c;
    latest.mq5_relative_level_pct = telemetry.readings.mq5
      ? {
          raw: round((telemetry.readings.mq5.raw_adc / 4_095) * 100),
          filtered: telemetry.readings.mq5.relative_level_pct,
        }
      : null;
  }

  return points;
}

function createAlerts(
  now: Date,
  scenario: SimulationScenario,
  acknowledgedIds: ReadonlySet<string>,
): DashboardAlert[] {
  const primaryAlert: DashboardAlert =
    scenario === 'device-offline'
      ? {
          id: 'device-offline',
          severity: 'warning',
          titleKey: 'alerts.deviceOfflineTitle',
          descriptionKey: 'alerts.deviceOfflineDescription',
          deviceId: DEVICE_ID,
          occurredAt: new Date(now.getTime() - 15 * 60 * 1_000).toISOString(),
          acknowledged: acknowledgedIds.has('device-offline'),
        }
      : {
          id: 'high-humidity',
          severity: 'warning',
          titleKey: 'alerts.highHumidityTitle',
          descriptionKey: 'alerts.highHumidityDescription',
          deviceId: DEVICE_ID,
          occurredAt: new Date(now.getTime() - 4 * 60 * 1_000).toISOString(),
          acknowledged: acknowledgedIds.has('high-humidity'),
        };

  return [
    primaryAlert,
    {
      id: 'calibration-progress',
      severity: 'information',
      titleKey: 'alerts.calibrationTitle',
      descriptionKey: 'alerts.calibrationDescription',
      deviceId: DEVICE_ID,
      occurredAt: new Date(now.getTime() - 12 * 60 * 1_000).toISOString(),
      acknowledged: acknowledgedIds.has('calibration-progress'),
    },
  ];
}

function createSnapshot(
  now: Date,
  step: number,
  scenario: SimulationScenario,
  intervalMs: number,
  acknowledgedIds: ReadonlySet<string>,
): DashboardSnapshot {
  const offline = scenario === 'device-offline';
  const waterNotInstalled = scenario === 'sensor-not-installed';
  const sequence = INITIAL_SEQUENCE + step;
  const humidityBoost = scenario === 'warning' ? 6.4 : 0;
  const phase = step * 0.43;
  const capturedAt = new Date(now.getTime() - (offline ? 15 * 60 * 1_000 : 5_300)).toISOString();
  const receivedAt = new Date(
    now.getTime() - (offline ? 15 * 60 * 1_000 - 350 : 5_000),
  ).toISOString();
  const installedQuality = offline ? SensorQuality.DEVICE_OFFLINE : SensorQuality.VALID;

  const telemetry: TelemetryV1 = {
    schema_version: TELEMETRY_SCHEMA_VERSION,
    message_id: createMessageId(sequence),
    device_id: DEVICE_ID,
    sequence_no: sequence,
    captured_at: capturedAt,
    device: {
      firmware_version: '0.2.0',
      uptime_s: INITIAL_UPTIME_SECONDS + Math.floor((step * intervalMs) / 1_000),
      wifi_rssi_dbm: -61 + Math.round(Math.sin(phase * 0.7)),
    },
    readings: {
      air_temperature_c: {
        raw: round(28.7 + Math.sin(phase) * 0.24),
        filtered: round(28.5 + Math.sin(phase) * 0.15),
      },
      air_humidity_pct: {
        raw: round(73.1 + humidityBoost + Math.sin(phase * 0.81) * 0.8),
        filtered: round(72.4 + humidityBoost + Math.sin(phase * 0.81) * 0.48),
      },
      water_temperature_c: waterNotInstalled
        ? null
        : {
            raw: round(26.9 + Math.sin(phase * 0.4) * 0.12),
            filtered: round(26.8 + Math.sin(phase * 0.4) * 0.08),
          },
      mq5: {
        raw_adc: Math.round(1_304 + Math.sin(phase * 1.2) * 18),
        filtered_adc: Math.round(1_289 + Math.sin(phase * 1.2) * 11),
        adc_voltage_v: round(0.5 + Math.sin(phase * 1.2) * 0.01, 2),
        relative_level_pct: round(31.5 + Math.sin(phase * 1.2) * 1.1),
      },
      ammonia_adc: null,
      water_flow_l_min: null,
      water_total_l: null,
      feed_weight_kg: null,
    },
    quality: {
      overall: offline ? SensorQuality.DEVICE_OFFLINE : SensorQuality.VALID,
      air_temperature: installedQuality,
      air_humidity: installedQuality,
      water_temperature: waterNotInstalled ? SensorQuality.NOT_INSTALLED : installedQuality,
      mq5: installedQuality,
      ammonia: SensorQuality.NOT_INSTALLED,
      water_flow: SensorQuality.NOT_INSTALLED,
      feed_weight: SensorQuality.NOT_INSTALLED,
    },
    calibration: {
      ds18b20: waterNotInstalled ? CalibrationStatus.NOT_REQUIRED : CalibrationStatus.IN_PROGRESS,
      mq5: CalibrationStatus.IN_PROGRESS,
      dht22: CalibrationStatus.UNCALIBRATED,
    },
  };

  return {
    telemetry,
    received_at: receivedAt,
    last_seen_at: receivedAt,
    deviceOnline: !offline,
    history: createHistory(now, step, scenario, telemetry),
    alerts: createAlerts(now, scenario, acknowledgedIds),
    installedSensorCount: waterNotInstalled ? 3 : 4,
    calibratingSensorCount: waterNotInstalled ? 1 : 2,
    disconnectedSensorCount: 0,
    scenario,
  };
}

export class MockTelemetrySource implements TelemetrySource {
  readonly mode = 'mock' as const;
  readonly scenario: SimulationScenario;

  private readonly intervalMs: number;
  private readonly initialDelayMs: number;
  private readonly now: () => Date;
  private readonly listeners = new Set<(snapshot: DashboardSnapshot) => void>();
  private readonly acknowledgedIds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private current: DashboardSnapshot;

  constructor(options: MockTelemetrySourceOptions = {}) {
    this.scenario = options.scenario ?? 'normal';
    this.intervalMs = options.intervalMs ?? 5_000;
    this.initialDelayMs = options.initialDelayMs ?? 320;
    this.now = options.now ?? (() => new Date());
    this.current = createSnapshot(
      this.now(),
      this.step,
      this.scenario,
      this.intervalMs,
      this.acknowledgedIds,
    );
  }

  async getInitialSnapshot(): Promise<DashboardSnapshot> {
    if (this.initialDelayMs > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, this.initialDelayMs));
    }

    return this.current;
  }

  subscribe(listener: (snapshot: DashboardSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      if (this.scenario !== 'device-offline') {
        this.step += 1;
        this.current = createSnapshot(
          this.now(),
          this.step,
          this.scenario,
          this.intervalMs,
          this.acknowledgedIds,
        );
      }
      this.emit();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  acknowledgeAlert(alertId: string): void {
    this.acknowledgedIds.add(alertId);
    this.current = {
      ...this.current,
      alerts: this.current.alerts.map((alert) =>
        alert.id === alertId ? { ...alert, acknowledged: true } : alert,
      ),
    };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.current));
  }
}

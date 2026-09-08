import type { SensorQuality, TelemetryV1 } from '@agronova/telemetry-schema';

import type { TranslationKey } from '../i18n/translations';

export type DataMode = 'mock' | 'api';
export type SimulationScenario = 'normal' | 'warning' | 'sensor-not-installed' | 'device-offline';
export type AlertSeverity = 'warning' | 'information';
export type TrendMetric =
  'air_temperature_c' | 'air_humidity_pct' | 'water_temperature_c' | 'mq5_relative_level_pct';

export interface TrendReading {
  raw: number;
  filtered: number;
}

export interface TrendPoint {
  captured_at: string;
  air_temperature_c: TrendReading | null;
  air_humidity_pct: TrendReading | null;
  water_temperature_c: TrendReading | null;
  mq5_relative_level_pct: TrendReading | null;
}

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  deviceId: string;
  occurredAt: string;
  acknowledged: boolean;
}

export interface DashboardSnapshot {
  telemetry: TelemetryV1;
  received_at: string;
  last_seen_at: string;
  deviceOnline: boolean;
  history: TrendPoint[];
  alerts: DashboardAlert[];
  installedSensorCount: number;
  calibratingSensorCount: number;
  disconnectedSensorCount: number;
  scenario: SimulationScenario;
}

export interface TelemetrySource {
  readonly mode: DataMode;
  readonly scenario: SimulationScenario | null;
  getInitialSnapshot(): Promise<DashboardSnapshot | null>;
  subscribe(listener: (snapshot: DashboardSnapshot) => void): () => void;
  start(): void;
  stop(): void;
  acknowledgeAlert(alertId: string): void;
}

export type TelemetryState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: DashboardSnapshot }
  | { kind: 'empty' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string };

export class TelemetrySourceError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'error',
    message: string,
  ) {
    super(message);
    this.name = 'TelemetrySourceError';
  }
}

export interface SensorCardModel {
  id: string;
  titleKey: TranslationKey;
  quality: SensorQuality;
}

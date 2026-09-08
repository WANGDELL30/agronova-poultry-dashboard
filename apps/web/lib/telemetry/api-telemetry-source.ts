import { TelemetrySourceError, type TelemetrySource, type DashboardSnapshot } from './types';

export class ApiTelemetrySource implements TelemetrySource {
  readonly mode = 'api' as const;
  readonly scenario = null;

  async getInitialSnapshot(): Promise<DashboardSnapshot | null> {
    throw new TelemetrySourceError(
      'unavailable',
      'API telemetry is intentionally unavailable during Frontend Phase F1.',
    );
  }

  subscribe(_listener: (snapshot: DashboardSnapshot) => void): () => void {
    return () => undefined;
  }

  start(): void {}

  stop(): void {}

  acknowledgeAlert(_alertId: string): void {}
}

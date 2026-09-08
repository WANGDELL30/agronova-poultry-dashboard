import { ApiTelemetrySource } from './api-telemetry-source';
import { MockTelemetrySource } from './mock-telemetry-source';
import type { DataMode, SimulationScenario, TelemetrySource } from './types';

const VALID_SCENARIOS = new Set<SimulationScenario>([
  'normal',
  'warning',
  'sensor-not-installed',
  'device-offline',
]);

export function resolveDataMode(value: string | undefined): DataMode {
  return value === 'api' ? 'api' : 'mock';
}

export function resolveScenario(value: string | undefined): SimulationScenario {
  return value && VALID_SCENARIOS.has(value as SimulationScenario)
    ? (value as SimulationScenario)
    : 'normal';
}

export function resolveInterval(value: string | undefined): number {
  const interval = Number(value ?? '5000');
  return Number.isInteger(interval) && interval >= 1_000 ? interval : 5_000;
}

export function createTelemetrySource(): TelemetrySource {
  const mode = resolveDataMode(process.env.NEXT_PUBLIC_DATA_MODE);
  if (mode === 'api') {
    return new ApiTelemetrySource();
  }

  return new MockTelemetrySource({
    scenario: resolveScenario(process.env.NEXT_PUBLIC_MOCK_SCENARIO),
    intervalMs: resolveInterval(process.env.NEXT_PUBLIC_MOCK_INTERVAL_MS),
  });
}

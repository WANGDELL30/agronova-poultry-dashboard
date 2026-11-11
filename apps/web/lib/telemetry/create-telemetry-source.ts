import { ApiTelemetrySource } from './api-telemetry-source';
import { DEFAULT_LIVE_INTERVAL_MS, DEFAULT_MOCK_INTERVAL_MS, resolveInterval } from './intervals';
import { MockTelemetrySource } from './mock-telemetry-source';
import type { DataMode, SimulationScenario, TelemetrySource } from './types';

const VALID_SCENARIOS = new Set<SimulationScenario>([
  'normal',
  'warning',
  'sensor-not-installed',
  'device-offline',
]);

export function resolveDataMode(
  value: string | undefined,
  runtime = process.env.NODE_ENV,
): DataMode {
  if (runtime === 'production') return 'api';
  return value === 'mock' ? 'mock' : 'api';
}

export function resolveScenario(value: string | undefined): SimulationScenario {
  return value && VALID_SCENARIOS.has(value as SimulationScenario)
    ? (value as SimulationScenario)
    : 'normal';
}

export { DEFAULT_LIVE_INTERVAL_MS, DEFAULT_MOCK_INTERVAL_MS, resolveInterval };

export function createTelemetrySource(): TelemetrySource {
  const mode = resolveDataMode(process.env.NEXT_PUBLIC_DATA_MODE);
  if (mode === 'api') {
    return new ApiTelemetrySource(process.env.NEXT_PUBLIC_API_BASE_URL ?? '', {
      deviceId: process.env.NEXT_PUBLIC_DEVICE_ID,
      intervalMs: resolveInterval(
        process.env.NEXT_PUBLIC_LIVE_INTERVAL_MS,
        DEFAULT_LIVE_INTERVAL_MS,
        'NEXT_PUBLIC_LIVE_INTERVAL_MS',
      ),
    });
  }

  return new MockTelemetrySource({
    scenario: resolveScenario(process.env.NEXT_PUBLIC_MOCK_SCENARIO),
    intervalMs: resolveInterval(
      process.env.NEXT_PUBLIC_MOCK_INTERVAL_MS,
      DEFAULT_MOCK_INTERVAL_MS,
      'NEXT_PUBLIC_MOCK_INTERVAL_MS',
    ),
  });
}

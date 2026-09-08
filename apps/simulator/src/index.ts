import { TELEMETRY_SCHEMA_VERSION } from '@agronova/telemetry-schema';

function main(): void {
  console.log(
    JSON.stringify({
      application: 'AgroNova telemetry simulator',
      status: 'idle',
      schema_version: TELEMETRY_SCHEMA_VERSION,
      message: 'Phase 1 placeholder started successfully; telemetry publishing is disabled.',
    }),
  );
}

main();

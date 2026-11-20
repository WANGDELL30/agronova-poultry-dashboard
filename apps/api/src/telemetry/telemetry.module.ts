import { Logger, Module } from '@nestjs/common';

import { TELEMETRY_AUTH, parseDeviceKeys, type TelemetryAuthConfig } from './device-keys.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';

@Module({
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    {
      provide: TELEMETRY_AUTH,
      useFactory: (): TelemetryAuthConfig => {
        const deviceKeys = parseDeviceKeys(process.env.TELEMETRY_DEVICE_KEYS);
        if (deviceKeys === null) {
          new Logger('TelemetryModule').warn(
            'TELEMETRY_DEVICE_KEYS is empty: POST /api/v1/telemetry accepts readings from anyone. ' +
              'Set it before the API is reachable from outside this machine (for example through a tunnel).',
          );
        }
        return { deviceKeys };
      },
    },
  ],
})
export class TelemetryModule {}

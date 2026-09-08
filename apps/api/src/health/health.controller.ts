import { Controller, Get, Inject } from '@nestjs/common';

import { DatabaseService, type DatabaseConnectivity } from '../database/database.service.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  database: {
    status: DatabaseConnectivity;
  };
}

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    const databaseStatus = await this.database.connectivity();

    return {
      status: databaseStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '0.1.0',
      database: {
        status: databaseStatus,
      },
    };
  }
}

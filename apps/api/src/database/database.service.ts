import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

export type DatabaseConnectivity = 'connected' | 'disconnected' | 'not_configured';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool | undefined;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      this.pool = undefined;
      return;
    }

    const timeout = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? '3000');
    if (!Number.isInteger(timeout) || timeout < 1) {
      throw new Error('DATABASE_CONNECT_TIMEOUT_MS must be a positive integer.');
    }

    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: timeout,
      max: 5,
    });

    this.pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error', error);
    });
  }

  async connectivity(): Promise<DatabaseConnectivity> {
    if (!this.pool) {
      return 'not_configured';
    }

    try {
      await this.pool.query('SELECT 1');
      return 'connected';
    } catch (error) {
      console.error('PostgreSQL connectivity check failed', error);
      return 'disconnected';
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}

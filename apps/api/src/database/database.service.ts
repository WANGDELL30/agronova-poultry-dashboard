import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

/** Upper bound for one query, so a hung database cannot hold a health request open (R16). */
export const QUERY_TIMEOUT_MS = 3000;

/**
 * A malformed DATABASE_URL is a configuration error, not a database outage: fail at startup instead
 * of reporting `disconnected` forever (AUDIT R16). The URL itself is not echoed (it holds a password).
 */
function assertPostgresUrl(value: string): void {
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL (expected postgres:// or postgresql://).');
  }
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(`DATABASE_URL must use postgres:// or postgresql://, not ${protocol}//.`);
  }
}

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

    assertPostgresUrl(connectionString);

    const timeout = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? '3000');
    if (!Number.isInteger(timeout) || timeout < 1) {
      throw new Error('DATABASE_CONNECT_TIMEOUT_MS must be a positive integer.');
    }

    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: timeout,
      query_timeout: QUERY_TIMEOUT_MS,
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

import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports ok only when PostgreSQL is reachable', async () => {
    const database = {
      connectivity: vi.fn().mockResolvedValue('connected'),
    } as unknown as DatabaseService;
    const response = await new HealthController(database).getHealth();

    expect(response.status).toBe('ok');
    expect(response.database.status).toBe('connected');
    expect(response.timestamp).toMatch(/Z$/);
    expect(response.version).toBeTruthy();
  });

  it('does not report a mock success when PostgreSQL is unavailable', async () => {
    const database = {
      connectivity: vi.fn().mockResolvedValue('disconnected'),
    } as unknown as DatabaseService;
    const response = await new HealthController(database).getHealth();

    expect(response.status).toBe('degraded');
    expect(response.database.status).toBe('disconnected');
  });
});

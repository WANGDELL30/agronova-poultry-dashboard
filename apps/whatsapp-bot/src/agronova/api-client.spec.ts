import { describe, expect, it, vi } from 'vitest';

import { receipt, visionResult } from '../test-fixtures.js';

import { AgronovaApiClient, AgronovaApiError } from './api-client.js';
import { fetchSnapshot } from './snapshot.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('AgronovaApiClient', () => {
  it('only issues GET requests under /api/v1', async () => {
    const fetchMock = vi.fn(async () => json(receipt()));
    const client = new AgronovaApiClient('http://api.test/', 1000, fetchMock as typeof fetch);
    await client.latestTelemetry('DEV 1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/telemetry/latest?device_id=DEV%201',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns null while the API holds no reading (204)', async () => {
    const client = new AgronovaApiClient(
      'http://api.test',
      1000,
      (async () => new Response(null, { status: 204 })) as typeof fetch,
    );
    expect(await client.latestTelemetry()).toBeNull();
  });

  it('rejects a body outside the shared schema instead of passing it on', async () => {
    const broken = { ...receipt(), device_online: 'yes' };
    const client = new AgronovaApiClient('http://api.test', 1000, (async () =>
      json(broken)) as typeof fetch);
    await expect(client.latestTelemetry()).rejects.toBeInstanceOf(AgronovaApiError);
  });

  it('reports HTTP errors and network failures as AgronovaApiError', async () => {
    const failing = new AgronovaApiClient('http://api.test', 1000, (async () =>
      json({}, 500)) as typeof fetch);
    await expect(failing.visionResults()).rejects.toBeInstanceOf(AgronovaApiError);
    const down = new AgronovaApiClient('http://api.test', 1000, (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    await expect(down.latestTelemetry()).rejects.toBeInstanceOf(AgronovaApiError);
  });
});

describe('fetchSnapshot', () => {
  it('combines telemetry and vision results', async () => {
    const results = [visionResult('stress')];
    const client = new AgronovaApiClient('http://api.test', 1000, (async (input) =>
      String(input).includes('/vision/') ? json(results) : json(receipt())) as typeof fetch);
    const snapshot = await fetchSnapshot(client, null);
    expect(snapshot.apiReachable).toBe(true);
    expect(snapshot.telemetry?.device_online).toBe(true);
    expect(snapshot.vision).toHaveLength(1);
  });

  it('marks the snapshot unreachable rather than empty when the API is down', async () => {
    const client = new AgronovaApiClient('http://api.test', 1000, (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    const snapshot = await fetchSnapshot(client, null);
    expect(snapshot.apiReachable).toBe(false);
  });
});

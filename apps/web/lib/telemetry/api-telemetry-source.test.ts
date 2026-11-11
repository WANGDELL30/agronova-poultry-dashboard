import { validTelemetryV1Example, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiTelemetrySource } from './api-telemetry-source';
import type { DashboardSnapshot } from './types';

const receipt: TelemetryReceiptV1 = {
  telemetry: validTelemetryV1Example,
  received_at: '2026-01-01T00:00:01.000Z',
  last_seen_at: '2026-01-01T00:00:01.000Z',
  device_online: true,
};

describe('ApiTelemetrySource', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('calls the global fetch without rebinding it when no fetcher is injected', async () => {
    // Browsers throw "Illegal invocation" when fetch is called with a receiver other than
    // the global object. Node's fetch does not, so the stub enforces the browser rule.
    const strictFetch = vi.fn(function (this: unknown, _input: RequestInfo | URL) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(
        new Response(JSON.stringify(receipt), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', strictFetch);
    vi.useFakeTimers();

    const source = new ApiTelemetrySource('http://api.test', { intervalMs: 1_000 });
    const snapshots: DashboardSnapshot[] = [];
    source.subscribe((snapshot) => snapshots.push(snapshot));

    source.start();
    await vi.advanceTimersByTimeAsync(1_000);
    source.stop();

    expect(strictFetch).toHaveBeenCalledOnce();
    expect(strictFetch.mock.results[0]).toMatchObject({ type: 'return' });
    expect(strictFetch.mock.calls[0]?.[0]).toBe('http://api.test/api/v1/telemetry/latest');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.telemetry.message_id).toBe(validTelemetryV1Example.message_id);
    expect(snapshots[0]?.deviceOnline).toBe(true);
  });

  it('treats only 204 as "no data yet"; 404 and other statuses are errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(
      new ApiTelemetrySource('http://api.test').getInitialSnapshot(),
    ).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));
    await expect(
      new ApiTelemetrySource('http://api.test').getInitialSnapshot(),
    ).rejects.toMatchObject({ kind: 'unavailable', message: 'Telemetry API returned HTTP 404.' });
  });

  it('reports an unconfigured API instead of requesting its own origin', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const source = new ApiTelemetrySource('   ', { intervalMs: 1_000 });

    await expect(source.getInitialSnapshot()).rejects.toMatchObject({ kind: 'unconfigured' });
    source.start();
    await vi.advanceTimersByTimeAsync(3_000);
    source.stop();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

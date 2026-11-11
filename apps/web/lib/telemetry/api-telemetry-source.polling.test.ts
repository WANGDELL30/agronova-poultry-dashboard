import { validTelemetryV1Example, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiTelemetrySource } from './api-telemetry-source';
import type { DashboardSnapshot } from './types';

function receiptAt(second: number, messageId: string, temperature = 21): TelemetryReceiptV1 {
  const at = `2026-01-01T01:00:0${second}.000Z`;
  return {
    telemetry: {
      ...validTelemetryV1Example,
      message_id: messageId,
      captured_at: at,
      readings: {
        ...validTelemetryV1Example.readings,
        air_temperature_c: { raw: temperature, filtered: temperature },
      },
    },
    received_at: at,
    last_seen_at: at,
    device_online: true,
  };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('ApiTelemetrySource polling (AUDIT H4, R5 web)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never starts a new poll while one is in flight and aborts a hanging request', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      // Hangs until aborted, like a request over a dead tunnel.
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
      });
    });
    const source = new ApiTelemetrySource('http://api.test', {
      intervalMs: 1_000,
      requestTimeoutMs: 5_000,
      fetcher: fetcher as typeof fetch,
    });

    source.start();
    await vi.advanceTimersByTimeAsync(4_500);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // The first poll starts at t = 1 s, so its 5 s timeout fires at t = 6 s.
    await vi.advanceTimersByTimeAsync(1_600);
    expect(signals[0]!.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_100); // next poll one interval after the previous settled
    expect(fetcher).toHaveBeenCalledTimes(2);
    source.stop();
    expect(signals[1]!.aborted).toBe(true);
  });

  it('ignores a response that is older than the snapshot already shown', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(receiptAt(2, ID(2), 22)))
      .mockResolvedValueOnce(ok(receiptAt(1, ID(1), 21)))
      .mockResolvedValue(ok(receiptAt(3, ID(3), 23)));
    const source = new ApiTelemetrySource('http://api.test', { intervalMs: 1_000, fetcher });
    const emitted: DashboardSnapshot[] = [];
    source.subscribe((snapshot) => emitted.push(snapshot));

    const initial = await source.getInitialSnapshot();
    expect(initial?.telemetry.captured_at).toBe('2026-01-01T01:00:02.000Z');
    source.start();
    await vi.advanceTimersByTimeAsync(2_000);
    source.stop();

    const shown = emitted.map((snapshot) => snapshot.telemetry.captured_at);
    expect(shown).not.toContain('2026-01-01T01:00:01.000Z');
    expect(shown.at(-1)).toBe('2026-01-01T01:00:03.000Z');
    expect(emitted.at(-1)!.history.map((point) => point.captured_at)).toEqual([
      '2026-01-01T01:00:02.000Z',
      '2026-01-01T01:00:03.000Z',
    ]);
  });

  it('keeps one trend point per message_id, sorted by captured_at (R5 web)', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(receiptAt(1, ID(1), 21)))
      .mockResolvedValueOnce(ok(receiptAt(1, ID(1), 21))) // same reading polled again
      .mockResolvedValueOnce(ok(receiptAt(2, ID(2), 22)))
      .mockResolvedValue(ok(receiptAt(2, ID(2), 22)));
    const source = new ApiTelemetrySource('http://api.test', { intervalMs: 1_000, fetcher });
    let last: DashboardSnapshot | null = await source.getInitialSnapshot();
    source.subscribe((snapshot) => (last = snapshot));
    source.start();
    await vi.advanceTimersByTimeAsync(3_000);
    source.stop();

    expect(last!.history.map((point) => point.message_id)).toEqual([ID(1), ID(2)]);
    expect(last!.history.map((point) => point.air_temperature_c?.filtered)).toEqual([21, 22]);
  });
});

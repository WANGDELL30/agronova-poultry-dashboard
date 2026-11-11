import { validTelemetryV1Example, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { ApiTelemetrySource } from '../../lib/telemetry/api-telemetry-source';
import { TelemetryProvider } from '../../lib/telemetry/telemetry-provider';
import { OverviewDashboard } from './overview-dashboard';

const T0 = Date.parse('2026-01-01T01:00:00.000Z');

function receipt(seenAt: number): TelemetryReceiptV1 {
  const at = new Date(seenAt).toISOString();
  return {
    telemetry: { ...validTelemetryV1Example, captured_at: at },
    received_at: at,
    last_seen_at: at,
    device_online: true,
  };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderOverview(fetcher: typeof fetch) {
  const source = new ApiTelemetrySource('http://api.test', { intervalMs: 3_000, fetcher });
  render(
    <LanguageProvider>
      <TelemetryProvider source={source}>
        <OverviewDashboard />
      </TelemetryProvider>
    </LanguageProvider>,
  );
}

const devicesOnlineValue = () =>
  screen.getByText('Perangkat Online').closest('article, section, div')!.textContent;

describe('stale telemetry (AUDIT H3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('switches to "not connected" after 2 failed polls and recovers on the next success', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(receipt(T0)))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementation(() => Promise.resolve(ok(receipt(Date.now()))));
    renderOverview(fetcher as unknown as typeof fetch);

    await advance(0);
    expect(devicesOnlineValue()).toContain('1/1');
    expect(screen.queryByText('Tidak tersambung · data basi')).toBeNull();

    await advance(3_000); // first failed poll: one blip is tolerated
    expect(screen.queryByText('Tidak tersambung · data basi')).toBeNull();

    await advance(3_000); // second failed poll in a row
    expect(screen.getByText('Tidak tersambung · data basi')).toBeTruthy();
    expect(devicesOnlineValue()).toContain('0/1');
    expect(screen.getByText('ESP32 offline')).toBeTruthy();

    await advance(3_000); // API answers again
    expect(screen.queryByText('Tidak tersambung · data basi')).toBeNull();
    expect(devicesOnlineValue()).toContain('1/1');
  });

  it('marks the device offline once last_seen_at is older than the offline threshold', async () => {
    // The API keeps answering with the same last reading (device stopped sending).
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(ok(receipt(T0))));
    renderOverview(fetcher as unknown as typeof fetch);

    await advance(0);
    expect(devicesOnlineValue()).toContain('1/1');

    await advance(31_000);
    expect(devicesOnlineValue()).toContain('0/1');
    expect(screen.getByText('Perangkat tidak mengirim data · data basi')).toBeTruthy();
    // The relative time is re-rendered by a timer, not frozen at "sekarang".
    expect(screen.getAllByText(/31 detik yang lalu/).length).toBeGreaterThan(0);
  });
});

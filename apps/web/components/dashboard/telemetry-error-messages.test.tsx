import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { ApiTelemetrySource } from '../../lib/telemetry/api-telemetry-source';
import { TelemetryProvider } from '../../lib/telemetry/telemetry-provider';
import type { TelemetryState } from '../../lib/telemetry/types';
import { ConnectionBanner } from '../operations/operations-shared';
import { OverviewDashboard } from './overview-dashboard';

const TECHNICAL = /Telemetry API|HTTP 500|unreachable|invalid payload/;

function renderOverview(response: Response | Error) {
  const fetcher = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  render(
    <LanguageProvider>
      <TelemetryProvider
        source={new ApiTelemetrySource('http://api.test', { fetcher: fetcher as typeof fetch })}
      >
        <OverviewDashboard />
      </TelemetryProvider>
    </LanguageProvider>,
  );
}

describe('telemetry error messages are localized (AUDIT D13)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a friendly Indonesian message for HTTP 500 and logs the technical one', async () => {
    renderOverview(new Response('boom', { status: 500 }));
    expect(await screen.findByText(/API telemetri tidak dapat dihubungi/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(TECHNICAL);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Telemetry API returned HTTP 500.'));
  });

  it('shows a friendly English message for an invalid payload when the UI is in English', async () => {
    window.localStorage.setItem('agronova-language', 'en');
    renderOverview(new Response(JSON.stringify({ nope: 1 }), { status: 200 }));
    expect(await screen.findByText(/did not match the telemetry format/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(TECHNICAL);
  });

  it('never renders the technical message in the operations banner', () => {
    const state: TelemetryState = { kind: 'unavailable', message: 'Telemetry API is unreachable.' };
    render(
      <LanguageProvider>
        <ConnectionBanner state={state} onRetry={() => undefined} />
      </LanguageProvider>,
    );
    expect(document.body.textContent).not.toMatch(TECHNICAL);
    expect(screen.getByText(/API telemetri tidak dapat dihubungi/)).toBeTruthy();
  });
});

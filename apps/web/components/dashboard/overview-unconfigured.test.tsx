import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { ApiTelemetrySource } from '../../lib/telemetry/api-telemetry-source';
import { TelemetryProvider } from '../../lib/telemetry/telemetry-provider';
import { ConnectionBanner } from '../operations/operations-shared';
import { OverviewDashboard } from './overview-dashboard';

describe('API base URL not configured', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows an explicit "API not configured" state on the overview without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <LanguageProvider>
        <TelemetryProvider source={new ApiTelemetrySource('')}>
          <OverviewDashboard />
        </TelemetryProvider>
      </LanguageProvider>,
    );

    expect(await screen.findByText('API belum dikonfigurasi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the same state in the operations connection banner', () => {
    render(
      <LanguageProvider>
        <ConnectionBanner state={{ kind: 'unconfigured' } as never} onRetry={() => undefined} />
      </LanguageProvider>,
    );
    expect(screen.getByText('API belum dikonfigurasi')).toBeTruthy();
  });
});

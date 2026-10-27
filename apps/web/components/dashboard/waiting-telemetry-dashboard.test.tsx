import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { WaitingTelemetryDashboard } from './waiting-telemetry-dashboard';

describe('WaitingTelemetryDashboard', () => {
  afterEach(() => cleanup());

  it('keeps summary and sensor cards visible while the API is unavailable', () => {
    const retry = vi.fn();
    render(
      <LanguageProvider>
        <WaitingTelemetryDashboard
          unavailable
          detail="Telemetry API is unreachable."
          onRetry={retry}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Menunggu perangkat & sensor')).toBeTruthy();
    expect(screen.getByText('Perangkat Online')).toBeTruthy();
    expect(screen.getByText('Suhu Udara')).toBeTruthy();
    expect(screen.getByText('Berat Pakan')).toBeTruthy();
    expect(screen.getAllByText('Menunggu sensor').length).toBeGreaterThanOrEqual(7);

    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

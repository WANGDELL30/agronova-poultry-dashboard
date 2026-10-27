import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { EmptyState, ErrorState, LoadingSkeleton } from './data-states';

describe('dashboard data states', () => {
  afterEach(() => cleanup());

  it('renders localized loading, empty, unavailable, and error states', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <LanguageProvider>
        <LoadingSkeleton />
      </LanguageProvider>,
    );
    expect(screen.getByText('Menyiapkan ikhtisar')).toBeTruthy();

    rerender(
      <LanguageProvider>
        <EmptyState />
      </LanguageProvider>,
    );
    expect(screen.getByText('Menunggu perangkat & sensor')).toBeTruthy();
    expect(screen.getByText(/angka tidak akan dibuat-buat/i)).toBeTruthy();

    rerender(
      <LanguageProvider>
        <ErrorState unavailable onRetry={retry} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Menunggu koneksi telemetri')).toBeTruthy();

    rerender(
      <LanguageProvider>
        <ErrorState onRetry={retry} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Data tidak dapat dimuat')).toBeTruthy();
  });
});

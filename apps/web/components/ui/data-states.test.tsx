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
    expect(screen.getByText('Belum ada telemetri')).toBeTruthy();

    rerender(
      <LanguageProvider>
        <ErrorState unavailable onRetry={retry} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Sumber data belum tersedia')).toBeTruthy();

    rerender(
      <LanguageProvider>
        <ErrorState onRetry={retry} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Data tidak dapat dimuat')).toBeTruthy();
  });
});

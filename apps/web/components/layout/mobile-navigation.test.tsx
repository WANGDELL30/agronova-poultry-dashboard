import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { MobileNavigation } from './mobile-navigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/overview',
}));

describe('MobileNavigation', () => {
  afterEach(() => cleanup());

  it('marks the active route and exposes secondary routes through More', () => {
    render(
      <LanguageProvider>
        <MobileNavigation />
      </LanguageProvider>,
    );

    expect(screen.getByRole('link', { name: 'Ikhtisar' }).getAttribute('aria-current')).toBe(
      'page',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lainnya' }));
    expect(screen.getByRole('link', { name: 'Analisis Historis' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kalibrasi' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ekspor Data' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pengaturan' })).toBeTruthy();
  });
});

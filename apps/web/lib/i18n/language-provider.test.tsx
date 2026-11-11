import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider, useLanguage } from './language-provider';

function LanguageProbe() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div>
      <span>{language}</span>
      <span>{t('nav.overview')}</span>
      <button type="button" onClick={() => setLanguage('en')}>
        English
      </button>
    </div>
  );
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('uses Indonesian by default', () => {
    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>,
    );

    expect(screen.getByText('Ikhtisar')).toBeTruthy();
    expect(screen.getByText('id')).toBeTruthy();
  });

  it('switches language and restores the saved choice', async () => {
    const firstRender = render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByText('Overview')).toBeTruthy();
    expect(window.localStorage.getItem('agronova-language')).toBe('en');
    firstRender.unmount();

    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>,
    );
    await waitFor(() => expect(screen.getByText('Overview')).toBeTruthy());
  });

  describe('when storage is blocked', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;

    afterEach(() => {
      Object.defineProperty(window, 'localStorage', original);
    });

    it('falls back to Indonesian and keeps working when the localStorage getter throws', async () => {
      // Blocked site data: merely reading window.localStorage throws SecurityError.
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });

      render(
        <LanguageProvider>
          <LanguageProbe />
        </LanguageProvider>,
      );
      expect(screen.getByText('Ikhtisar')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'English' }));
      await waitFor(() => expect(screen.getByText('Overview')).toBeTruthy());
    });

    it('ignores a failing setItem (quota exceeded) when switching language', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
      render(
        <LanguageProvider>
          <LanguageProbe />
        </LanguageProvider>,
      );

      expect(() => fireEvent.click(screen.getByRole('button', { name: 'English' }))).not.toThrow();
      expect(screen.getByText('Overview')).toBeTruthy();
    });
  });
});

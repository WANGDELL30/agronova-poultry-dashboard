import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
});

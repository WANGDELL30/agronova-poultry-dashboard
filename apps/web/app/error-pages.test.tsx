import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../lib/i18n/language-provider';
import RouteError from './error';
import GlobalError from './global-error';
import NotFound from './not-found';

describe('error and not-found pages', () => {
  afterEach(() => cleanup());

  it('renders a localized 404 inside the app providers with a way back', () => {
    render(
      <LanguageProvider>
        <NotFound />
      </LanguageProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kembali ke Ikhtisar' }).getAttribute('href')).toBe(
      '/overview',
    );
  });

  it('catches a route error and retries with reset()', () => {
    const reset = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <LanguageProvider>
        <RouteError error={new Error('boom')} reset={reset} />
      </LanguageProvider>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Halaman ini gagal dimuat')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('renders a static bilingual global error page with its own <html> and no providers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<GlobalError error={new Error('boom')} reset={() => {}} />);
    expect(html.startsWith('<html')).toBe(true);
    expect(html).toContain('<body');
    expect(html).toContain('Aplikasi gagal dimuat');
    expect(html).toContain('The application failed to load');
    expect(html).toContain('Coba lagi / Try again');
  });
});

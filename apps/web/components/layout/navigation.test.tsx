import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { activeHref, pageTitleKey } from './navigation';
import { Sidebar } from './sidebar';

const pathname = vi.hoisted(() => ({ current: '/live' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

describe('route-derived header title and active navigation', () => {
  afterEach(() => cleanup());

  it('uses the module title only for a known route', () => {
    expect(pageTitleKey('/live')).toBe('nav.live');
    expect(pageTitleKey('/overview')).toBe('nav.overview');
    expect(pageTitleKey('/live/')).toBe('nav.live');
  });

  it('uses a neutral title for unknown paths instead of a prefix match or Overview', () => {
    expect(pageTitleKey('/live/extra')).toBe('app.shortName');
    expect(pageTitleKey('/nope')).toBe('app.shortName');
    expect(pageTitleKey('/liveextra')).toBe('app.shortName');
    expect(activeHref('/live/extra')).toBeNull();
    expect(activeHref('/vision')).toBe('/vision');
  });

  it('marks no sidebar link active on an unknown nested path', () => {
    pathname.current = '/live/extra';
    render(
      <LanguageProvider>
        <Sidebar />
      </LanguageProvider>,
    );
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Pemantauan Langsung' })).toBeTruthy();
  });
});

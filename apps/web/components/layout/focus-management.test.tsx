import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { AppShell } from './app-shell';

const navigation = vi.hoisted(() => ({ pathname: '/overview' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock('../../lib/telemetry/telemetry-provider', () => ({
  useTelemetry: () => ({ mode: 'mock', scenario: null, state: { kind: 'loading' } }),
}));

function renderShell() {
  return render(
    <LanguageProvider>
      <AppShell>
        <p>content</p>
      </AppShell>
    </LanguageProvider>,
  );
}

describe('focus management (AUDIT D12)', () => {
  afterEach(() => {
    cleanup();
    navigation.pathname = '/overview';
  });

  it('starts with a skip link to <main>', () => {
    const { container } = renderShell();
    const firstFocusable = container.querySelector('a[href], button, select, input, [tabindex]');
    const skip = screen.getByRole('link', { name: 'Langsung ke konten utama' });

    expect(firstFocusable).toBe(skip);
    expect(skip.getAttribute('href')).toBe('#main-content');
    const main = screen.getByRole('main');
    expect(main.id).toBe('main-content');
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  it('moves focus to the page heading when the route changes, not on first load', () => {
    const view = renderShell();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(document.activeElement).not.toBe(heading);

    navigation.pathname = '/live';
    view.rerender(
      <LanguageProvider>
        <AppShell>
          <p>content</p>
        </AppShell>
      </LanguageProvider>,
    );

    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });
});

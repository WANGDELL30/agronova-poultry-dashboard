import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { CollaborationFooter } from './collaboration-footer';

describe('CollaborationFooter', () => {
  afterEach(() => cleanup());

  it('shows both collaboration partners with accessible logo descriptions', () => {
    render(
      <LanguageProvider>
        <CollaborationFooter />
      </LanguageProvider>,
    );

    expect(screen.getByText('Bersama membangun peternakan cerdas')).toBeTruthy();
    expect(screen.getByAltText('Logo Data Science Center Universitas Indonesia')).toBeTruthy();
    expect(screen.getByAltText('Logo Karya Kreasi Group')).toBeTruthy();
  });
});

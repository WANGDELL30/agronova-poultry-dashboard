import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { CollaborationMark } from './collaboration-footer';

describe('CollaborationMark', () => {
  afterEach(() => cleanup());

  it('shows both collaboration partners in the header with accessible logo descriptions', () => {
    render(
      <LanguageProvider>
        <CollaborationMark />
      </LanguageProvider>,
    );

    expect(screen.getByText('Mitra kolaborasi')).toBeTruthy();
    expect(screen.getByAltText('Logo Data Science Center Universitas Indonesia')).toBeTruthy();
    expect(screen.getByAltText('Logo Karya Kreasi Group')).toBeTruthy();
  });
});

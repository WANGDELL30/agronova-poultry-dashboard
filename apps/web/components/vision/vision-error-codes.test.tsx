import { VISION_API_ERROR_CODES } from '@agronova/vision-schema';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { en, id } from '../../lib/i18n/translations';
import { VisionClientError, type VisionClient } from '../../lib/vision/vision-client';
import { VisionDashboard } from './vision-dashboard';

describe('vision error codes come from the contract (AUDIT H16)', () => {
  afterEach(() => cleanup());

  it('has an Indonesian and an English message for every API error code', () => {
    expect(VISION_API_ERROR_CODES.length).toBeGreaterThan(0);
    for (const code of VISION_API_ERROR_CODES) {
      expect(id).toHaveProperty(`vision.error.${code}`);
      expect(en).toHaveProperty(`vision.error.${code}`);
    }
  });

  it.each([...VISION_API_ERROR_CODES])('shows the specific message for %s', async (code) => {
    const client: VisionClient = {
      mode: 'api',
      list: vi.fn().mockResolvedValue([]),
      submit: vi.fn().mockRejectedValue(new VisionClientError(code, 'x')),
      imageUrl: () => null,
    };
    render(
      <LanguageProvider>
        <VisionDashboard client={client} />
      </LanguageProvider>,
    );
    await userEvent.upload(
      screen.getByLabelText(/Foto ayam/),
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Analisis foto' }));
    const key = `vision.error.${code}` as keyof typeof id;
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(id[key]));
  });
});

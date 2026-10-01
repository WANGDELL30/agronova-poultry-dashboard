import type { VisionResultV1 } from '@agronova/vision-schema';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { VisionClientError, type VisionClient } from '../../lib/vision/vision-client';
import { VisionDashboard } from './vision-dashboard';

const skipped: VisionResultV1 = {
  schema_version: 1,
  message_id: '6f9619ff-8b86-4d11-b42d-00c04fc964ff',
  camera_id: 'cam-01',
  kandang_id: null,
  captured_at: '2026-10-01T01:00:00.000Z',
  received_at: '2026-10-01T01:00:01.000Z',
  inference_mode: 'real',
  model: null,
  inference_ms: 3,
  quality: { status: 'skipped', issues: ['blur'] },
  status: 'skipped_quality',
  result: null,
  raw_response: null,
  error_message: null,
  vote: {
    status: 'ignored_no_result',
    trigger_alert: false,
    window_size: 5,
    window_filled: 0,
    majority_label: null,
    majority_count: null,
  },
  image_available: false,
};

function fakeClient(overrides: Partial<VisionClient> = {}): VisionClient {
  return {
    mode: 'api',
    list: vi.fn().mockResolvedValue([]),
    submit: vi.fn(),
    imageUrl: () => null,
    ...overrides,
  };
}
const setup = (client: VisionClient) =>
  render(
    <LanguageProvider>
      <VisionDashboard client={client} />
    </LanguageProvider>,
  );

describe('VisionDashboard', () => {
  afterEach(() => cleanup());

  it('shows a skipped frame as "no result", never as not stressed', async () => {
    const client = fakeClient({
      submit: vi.fn().mockResolvedValue(skipped),
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([skipped]),
    });
    setup(client);
    await userEvent.upload(
      screen.getByLabelText(/Foto ayam/),
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Analisis foto' }));
    await waitFor(() => expect(screen.getByText(/Tidak ada hasil klasifikasi/)).toBeTruthy());
    expect(screen.getAllByText('Dilewati: kualitas citra buruk').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tidak stres')).toBeNull();
  });

  it('requires a photo and shows a localized error for API failures', async () => {
    const submit = vi.fn().mockRejectedValue(new VisionClientError('inference_timeout', 'slow'));
    setup(fakeClient({ submit }));
    await userEvent.click(screen.getByRole('button', { name: 'Analisis foto' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Pilih foto terlebih dahulu.');
    expect(submit).not.toHaveBeenCalled();
    await userEvent.upload(
      screen.getByLabelText(/Foto ayam/),
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Analisis foto' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/terlalu lama menjawab/),
    );
  });

  it('labels mock mode so simulated output is not mistaken for the real model', async () => {
    setup(fakeClient({ mode: 'mock' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/Mode simulasi/)).toBeTruthy();
  });
});

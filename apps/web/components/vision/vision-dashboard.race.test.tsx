import type { VisionResultV1 } from '@agronova/vision-schema';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import type { VisionClient } from '../../lib/vision/vision-client';
import { VisionDashboard } from './vision-dashboard';

const record: VisionResultV1 = {
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

describe('VisionDashboard list race (AUDIT H5)', () => {
  afterEach(() => cleanup());

  it('does not let a slow initial list overwrite the newer list loaded after an upload', async () => {
    let resolveInitial!: (list: VisionResultV1[]) => void;
    const list = vi
      .fn<() => Promise<VisionResultV1[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveInitial = resolve)))
      .mockResolvedValue([record]);
    const client: VisionClient = {
      mode: 'api',
      list,
      submit: vi.fn().mockResolvedValue(record),
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

    // The refresh after the upload finished first: history is shown, not "loading".
    await waitFor(() => expect(screen.getByRole('list')).toBeTruthy());
    expect(screen.queryByText('Memuat riwayat…')).toBeNull();

    // The older initial request answers last with an empty list; it must be ignored.
    await act(async () => resolveInitial([]));
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.queryByText('Belum ada foto yang dianalisis.')).toBeNull();
  });
});

import type { VisionResultV1 } from '@agronova/vision-schema';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { VisionResultCard } from './vision-result-card';

const failed: VisionResultV1 = {
  schema_version: 1,
  message_id: '6f9619ff-8b86-4d11-b42d-00c04fc964ff',
  camera_id: 'cam-01',
  kandang_id: null,
  captured_at: '2026-10-01T01:00:00.000Z',
  received_at: '2026-10-01T01:00:01.000Z',
  inference_mode: null,
  model: null,
  inference_ms: null,
  quality: null,
  status: 'inference_error',
  result: null,
  raw_response: null,
  error_message: 'HTTP 500',
  vote: {
    status: 'ignored_no_result',
    trigger_alert: false,
    window_size: 5,
    window_filled: 0,
    majority_label: null,
    majority_count: null,
  },
  image_available: true,
};

const renderCard = (record: VisionResultV1) =>
  render(
    <LanguageProvider>
      <VisionResultCard record={record} imageUrl={null} />
    </LanguageProvider>,
  );

describe('VisionResultCard', () => {
  afterEach(() => cleanup());

  it('shows an unknown inference mode instead of guessing "real" (K5)', () => {
    renderCard(failed);
    expect(screen.getByText('Mode inferensi')).toBeTruthy();
    expect(screen.getByText('Tidak diketahui')).toBeTruthy();
    expect(screen.queryByText(/real/)).toBeNull();
  });
});

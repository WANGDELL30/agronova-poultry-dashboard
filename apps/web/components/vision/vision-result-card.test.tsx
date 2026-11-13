import type { VisionResultV1 } from '@agronova/vision-schema';
import { cleanup, render, screen } from '@testing-library/react';
import { CircleHelp } from 'lucide-react';
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

  const undetermined: VisionResultV1 = {
    ...failed,
    inference_mode: 'mock',
    model: { base_model: 'b', adapter: 'a', adapter_revision: null },
    inference_ms: 4,
    quality: { status: 'ok', issues: [] },
    status: 'classified',
    error_message: null,
    result: {
      indicators: {
        posisi_ekor: 'YA',
        posisi_kepala: 'TIDAK',
        penutupan_mata: 'TIDAK',
        pembukaan_paruh: 'TIDAK',
        posisi_sayap: 'TIDAK_TERLIHAT',
        postur_kaki: 'TIDAK_TERLIHAT',
        kondisi_bulu: 'TIDAK_TERLIHAT',
      },
      total_ya: 1,
      visible_count: 4,
      label: 'undefined',
      score_stress: 1 / 7,
      confidence: null,
    },
    vote: { ...failed.vote, status: 'ignored_undefined' },
  };

  it('uses the help icon, not a check mark, for an undefined label (K7)', () => {
    const { container } = renderCard(undetermined);
    const expected = render(<CircleHelp />)
      .container.querySelector('svg')!
      .getAttribute('class');
    const badge = container.querySelector('.vision-badge svg');
    expect(badge?.getAttribute('class')).toBe(expected);
  });

  it('does not show a stress score for an undefined label (K7)', () => {
    renderCard(undetermined);
    expect(screen.queryByText('0,14')).toBeNull();
    expect(screen.getByText('Tidak dapat dinilai')).toBeTruthy();
  });
});

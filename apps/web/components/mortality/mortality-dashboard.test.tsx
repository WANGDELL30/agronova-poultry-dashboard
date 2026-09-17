import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../lib/i18n/language-provider';
import { MortalityDashboard } from './mortality-dashboard';

const model = {
  runtime_status: 'ready',
  prediction_status: 'MODEL_INPUTS_UNAVAILABLE',
  operational_ready: false,
  input: { timesteps: 24, features: 9, available_non_gas_features: 7 },
  output: { classes: 3, labels: ['Normal', 'Waspada', 'Bahaya'] },
};
const renderDashboard = () =>
  render(
    <LanguageProvider>
      <MortalityDashboard />
    </LanguageProvider>,
  );

describe('MortalityDashboard', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows unavailable state and retries without inventing readiness', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => model });
    vi.stubGlobal('fetch', fetcher);
    renderDashboard();
    expect(await screen.findByText('Model belum dapat diakses')).toBeTruthy();
    expect(screen.queryByText('Model tersimpan · prediksi nonaktif')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Model tersimpan · prediksi nonaktif')).toBeTruthy();
  });

  it('shows non-gas readiness and offers no public inference control', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => model }));
    renderDashboard();
    expect(await screen.findByText('7/9')).toBeTruthy();
    expect(screen.getByText(/Suhu kandang, kelembapan kandang/)).toBeTruthy();
    expect(screen.getByText(/recall Waspada dan Bahaya sama-sama 0%/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Jalankan uji/i })).toBeNull();
    expect(screen.queryByLabelText(/File input/i)).toBeNull();
    expect(screen.queryByText(/Skor kelas/i)).toBeNull();
  });
});

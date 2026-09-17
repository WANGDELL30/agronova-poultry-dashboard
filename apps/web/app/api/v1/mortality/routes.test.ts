// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from './model/route';
import { POST as diagnose } from './diagnostics/route';
import { POST as predict } from './predict/route';

describe('Vercel mortality endpoints', () => {
  it('reports the loaded model', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const status = await response.json();
    expect(status.input.timesteps).toBe(24);
    expect(status.input.available_non_gas_features).toBe(7);
    expect(status.prediction_status).toBe('MODEL_INPUTS_UNAVAILABLE');
  });
  it('blocks public diagnostics without reading or padding inputs', async () => {
    const response = await diagnose();
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('MODEL_INPUTS_UNAVAILABLE');
    expect(body.blocking_reasons).toContain('GAS_FEATURES_UNAVAILABLE');
    expect(body.mortality_prediction).toBeNull();
  });
  it('never returns an invented mortality prediction', async () => {
    const response = await predict();
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('MODEL_INPUTS_UNAVAILABLE');
    expect(body.mortality_prediction).toBeNull();
  });
});

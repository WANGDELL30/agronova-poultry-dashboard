import { memory } from '@tensorflow/tfjs';
import { describe, expect, it } from 'vitest';
import { diagnosticInputSchema, modelInputsUnavailable } from './contract.js';
import { getModelStatus, runDiagnostic } from './runtime.js';
import reference from './reference-fixtures.json' with { type: 'json' };

const request = (sequence: unknown) => ({
  purpose: 'technical_diagnostic',
  preprocessed: true,
  sequence,
});

describe('imported mortality LSTM', () => {
  it('loads the real weights and exposes the notebook contract without claiming readiness', async () => {
    const status = await getModelStatus();
    expect(status.runtime_status).toBe('ready');
    expect(status.prediction_status).toBe('MODEL_INPUTS_UNAVAILABLE');
    expect(status.operational_ready).toBe(false);
    expect(status.input.timesteps).toBe(24);
    expect(status.input.sample_interval_seconds).toBe(3600);
    expect(status.input.source_timezone).toBeNull();
    expect(status.input.feature_names).toHaveLength(9);
    expect(status.input.available_non_gas_features).toBe(7);
    expect(status.input.deferred_features).toEqual(['amonia_ppm', 'level_gas_relatif_mq5_persen']);
    expect(status.output.labels).toEqual(['Normal', 'Waspada', 'Bahaya']);
    expect(status.validation.recall).toEqual({ Normal: 1, Waspada: 0, Bahaya: 0 });
    expect(modelInputsUnavailable.blocking_reasons).toContain('GAS_FEATURES_UNAVAILABLE');
    expect(modelInputsUnavailable.mortality_prediction).toBeNull();
  });

  it.each(reference.cases)(
    'matches original Keras H5 inference: $name',
    async ({ sequence, scores }) => {
      const result = await runDiagnostic(request(sequence));
      result.scores.forEach(({ score, label }, index) => {
        expect(Math.abs(score - scores[index]!)).toBeLessThan(1e-5);
        expect(label).toBe(['Normal', 'Waspada', 'Bahaya'][index]);
      });
      expect(result.mortality_prediction).toBeNull();
      expect(result.generated_at).toMatch(/Z$/);
    },
  );

  it.each([null, '1', NaN, Infinity, -Infinity, 1e7])(
    'rejects invalid values instead of coercing %s',
    async (invalid) => {
      const sequence: unknown[][] = Array.from({ length: 24 }, () => Array<unknown>(9).fill(0));
      sequence[0]![0] = invalid;
      await expect(runDiagnostic(request(sequence))).rejects.toThrow();
    },
  );

  it('rejects wrong dimensions and input without preprocessing acknowledgment', () => {
    expect(
      diagnosticInputSchema.safeParse(request(Array.from({ length: 23 }, () => Array(9).fill(0))))
        .success,
    ).toBe(false);
    expect(
      diagnosticInputSchema.safeParse(request(Array.from({ length: 24 }, () => Array(8).fill(0))))
        .success,
    ).toBe(false);
    expect(
      diagnosticInputSchema.safeParse({
        ...request(reference.cases[0]!.sequence),
        preprocessed: false,
      }).success,
    ).toBe(false);
  });

  it('reuses weights and releases tensors after repeated requests', async () => {
    const input = request(reference.cases[0]!.sequence);
    await runDiagnostic(input);
    const baseline = memory().numTensors;
    for (let i = 0; i < 5; i++) await runDiagnostic(input);
    expect(memory().numTensors).toBe(baseline);
  });
});

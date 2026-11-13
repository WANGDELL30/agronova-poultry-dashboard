// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// If anything on the import path pulls in TensorFlow.js, this factory throws (AUDIT D15).
vi.mock('@tensorflow/tfjs', () => {
  throw new Error('tfjs must not be loaded by the constant 409 routes');
});

describe('predict and diagnostics routes do not load tfjs (D15)', () => {
  it('imports the contract subpath only', async () => {
    const contract = await import('@agronova/mortality-model/contract');
    expect(contract.modelInputsUnavailable.code).toBe('MODEL_INPUTS_UNAVAILABLE');
    expect((await (await import('./predict/route')).POST()).status).toBe(409);
    expect((await (await import('./diagnostics/route')).POST()).status).toBe(409);
  });
});

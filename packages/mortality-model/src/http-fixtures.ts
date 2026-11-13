import { modelInputsUnavailable } from './contract.js';

/**
 * Expected HTTP behaviour shared by the NestJS API and the Vercel Route Handlers (AUDIT K11). Both
 * implementations are kept; these cases keep them equal. `body` is matched as a subset.
 */
export interface MortalityHttpCase {
  name: string;
  method: 'GET' | 'POST';
  path: 'model' | 'predict' | 'diagnostics';
  /** false: the model fails to load (simulated by the test). */
  modelLoads: boolean;
  requestBody?: string;
  contentType?: string;
  status: number;
  body: Record<string, unknown>;
  cacheControl: string;
}

export const mortalityHttpCases: readonly MortalityHttpCase[] = [
  {
    name: 'model ready',
    method: 'GET',
    path: 'model',
    modelLoads: true,
    status: 200,
    body: {
      model_id: 'mortality-lstm-v1',
      runtime_status: 'ready',
      prediction_status: 'MODEL_INPUTS_UNAVAILABLE',
      operational_ready: false,
    },
    cacheControl: 'no-store',
  },
  {
    name: 'model fails to load',
    method: 'GET',
    path: 'model',
    modelLoads: false,
    status: 503,
    body: { code: 'MODEL_UNAVAILABLE' },
    cacheControl: 'no-store',
  },
  {
    name: 'predict',
    method: 'POST',
    path: 'predict',
    modelLoads: true,
    requestBody: '{}',
    contentType: 'application/json',
    status: 409,
    body: { ...modelInputsUnavailable },
    cacheControl: 'no-store',
  },
  {
    name: 'diagnostics',
    method: 'POST',
    path: 'diagnostics',
    modelLoads: true,
    requestBody: '{}',
    contentType: 'application/json',
    status: 409,
    body: { ...modelInputsUnavailable },
    cacheControl: 'no-store',
  },
  {
    name: 'malformed body',
    method: 'POST',
    path: 'predict',
    modelLoads: true,
    requestBody: '{"sequence": [1, 2',
    contentType: 'application/json',
    status: 409,
    body: { ...modelInputsUnavailable },
    cacheControl: 'no-store',
  },
];

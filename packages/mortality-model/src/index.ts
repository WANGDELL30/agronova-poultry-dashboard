// Server-only runtime. Frontend components must use type-only imports.
export { getModelStatus, PermanentModelError, reportModelFailure } from './runtime.js';
export {
  deferredGasFeatures,
  modelInputsUnavailable,
  mortalityClassLabels,
  mortalityFeatureNames,
} from './contract.js';
export type { DiagnosticInput, DiagnosticResult, ModelStatus } from './contract.js';
export { mortalityHttpCases, type MortalityHttpCase } from './http-fixtures.js';

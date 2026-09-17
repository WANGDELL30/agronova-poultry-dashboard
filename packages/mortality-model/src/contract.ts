import { z } from 'zod';

// Values must already be preprocessed by the original training pipeline.
// Never coerce missing data, strings, or sensor-quality states into numeric inputs.
export const diagnosticInputSchema = z
  .object({
    purpose: z.literal('technical_diagnostic'),
    preprocessed: z.literal(true),
    sequence: z.array(z.array(z.number().finite().min(-1e6).max(1e6)).length(9)).length(24),
  })
  .strict();

export type DiagnosticInput = z.infer<typeof diagnosticInputSchema>;

export const mortalityFeatureNames = [
  'suhu_kandang_C',
  'kelembapan_kandang_persen',
  'amonia_ppm',
  'level_gas_relatif_mq5_persen',
  'suhu_air_minum_C',
  'tds_air_minum_ppm',
  'level_air_persen',
  'konsumsi_pakan_gram',
  'aktivitas_telur_butir',
] as const;

export const deferredGasFeatures = ['amonia_ppm', 'level_gas_relatif_mq5_persen'] as const;

export const mortalityClassLabels = ['Normal', 'Waspada', 'Bahaya'] as const;

export interface ModelStatus {
  model_id: string;
  source_sha256: string;
  runtime: 'tensorflowjs-cpu';
  runtime_status: 'ready';
  prediction_status: 'MODEL_INPUTS_UNAVAILABLE';
  operational_ready: false;
  input: {
    timesteps: 24;
    features: 9;
    sample_interval_seconds: 3600;
    source_timezone: null;
    feature_names: typeof mortalityFeatureNames;
    available_non_gas_features: 7;
    deferred_features: typeof deferredGasFeatures;
  };
  output: { classes: 3; labels: typeof mortalityClassLabels; activation: 'softmax' };
  blocking_reasons: readonly string[];
  validation: {
    test_samples: 120;
    accuracy: 0.94;
    recall: { Normal: 1; Waspada: 0; Bahaya: 0 };
    suitable_for_operational_alerts: false;
  };
}

export interface DiagnosticResult {
  model_id: string;
  source_sha256: string;
  generated_at: string;
  purpose: 'technical_diagnostic';
  prediction_status: 'TECHNICAL_ONLY';
  scores: {
    class_index: number;
    score: number;
    label: (typeof mortalityClassLabels)[number];
  }[];
  mortality_prediction: null;
}

export const modelInputsUnavailable = {
  code: 'MODEL_INPUTS_UNAVAILABLE',
  mortality_prediction: null,
  blocking_reasons: [
    'GAS_FEATURES_UNAVAILABLE',
    'FITTED_SCALER_MISSING',
    'RISK_CLASS_RECALL_ZERO',
    'SOURCE_TIMEZONE_UNKNOWN',
  ],
} as const;

import { createHash } from 'node:crypto';
import * as tf from '@tensorflow/tfjs';

import artifact from './model-artifact.json' with { type: 'json' };
import {
  diagnosticInputSchema,
  deferredGasFeatures,
  modelInputsUnavailable,
  mortalityClassLabels,
  mortalityFeatureNames,
  type DiagnosticResult,
  type ModelStatus,
} from './contract.js';

let modelPromise: Promise<tf.LayersModel> | undefined;

async function loadModel(): Promise<tf.LayersModel> {
  await tf.setBackend('cpu');
  await tf.ready();
  const weights = Buffer.from(artifact.weightDataBase64, 'base64');
  if (createHash('sha256').update(weights).digest('hex') !== artifact.weights_sha256) {
    throw new Error('Model weight checksum mismatch.');
  }
  const model = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: artifact.modelTopology,
      weightSpecs: artifact.weightSpecs as tf.io.WeightsManifestEntry[],
      weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
    }),
  );
  if (model.inputs[0]?.shape.join(',') !== ',24,9' || model.outputs[0]?.shape.join(',') !== ',3') {
    model.dispose();
    throw new Error('Unexpected mortality model input/output dimensions.');
  }
  return model;
}

function getModel(): Promise<tf.LayersModel> {
  modelPromise ??= loadModel().catch((error: unknown) => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

export async function getModelStatus(): Promise<ModelStatus> {
  await getModel();
  return {
    model_id: 'mortality-lstm-v1',
    source_sha256: artifact.source_sha256,
    runtime: 'tensorflowjs-cpu',
    runtime_status: 'ready',
    prediction_status: 'MODEL_INPUTS_UNAVAILABLE',
    operational_ready: false,
    input: {
      timesteps: 24,
      features: 9,
      sample_interval_seconds: 3600,
      source_timezone: null,
      feature_names: mortalityFeatureNames,
      available_non_gas_features: 7,
      deferred_features: deferredGasFeatures,
    },
    output: { classes: 3, labels: mortalityClassLabels, activation: 'softmax' },
    blocking_reasons: modelInputsUnavailable.blocking_reasons,
    validation: {
      test_samples: 120,
      accuracy: 0.94,
      recall: { Normal: 1, Waspada: 0, Bahaya: 0 },
      suitable_for_operational_alerts: false,
    },
  };
}

export async function runDiagnostic(input: unknown): Promise<DiagnosticResult> {
  const request = diagnosticInputSchema.parse(input);
  const model = await getModel();
  // One fixed-size window per request. Both input and intermediate tensors are disposed.
  const scores = tf.tidy(() => {
    const output = model.predict(tf.tensor3d([request.sequence], [1, 24, 9]));
    if (Array.isArray(output)) throw new Error('Unexpected multiple outputs.');
    return Array.from(output.dataSync());
  });
  if (
    scores.length !== 3 ||
    !scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 1)
  ) {
    throw new Error('Model produced invalid scores.');
  }
  return {
    model_id: 'mortality-lstm-v1',
    source_sha256: artifact.source_sha256,
    generated_at: new Date().toISOString(),
    purpose: 'technical_diagnostic',
    prediction_status: 'TECHNICAL_ONLY',
    scores: scores.map((score, class_index) => ({
      class_index,
      score,
      label: mortalityClassLabels[class_index]!,
    })),
    mortality_prediction: null,
  };
}

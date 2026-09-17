# Mortality LSTM integration

The supplied `model_mortalitas_lstm.h5` remains installed as a checksum-verified, server-side model
artifact in `@agronova/mortality-model`. The model is intentionally inactive for operational
predictions while gas inputs are deferred. It is not exposed to browser code.

## Verified training contract

The supplied notebook builds the same architecture and saves the H5 model:

- Input shape: `[batch, 24, 9]`.
- Sample interval in the notebook dataset: one hour. Each sequence uses the previous 24 rows and the
  target label from the next row.
- Model: LSTM(64, sequences) → Dropout(0.2) → LSTM(32) → Dropout(0.2) → Dense(16,
  relu) → Dense(3, softmax).
- Target mapping: `0 = Normal`, `1 = Waspada`, `2 = Bahaya`.
- Preprocessing: `MinMaxScaler` fitted on the first 80% of the chronological rows. The fitted artifact
  is saved as `scaler_mortalitas.pkl`, but that file has not been supplied to this repository.

The required feature order is:

1. `suhu_kandang_C`
2. `kelembapan_kandang_persen`
3. `amonia_ppm`
4. `level_gas_relatif_mq5_persen`
5. `suhu_air_minum_C`
6. `tds_air_minum_ppm`
7. `level_air_persen`
8. `konsumsi_pakan_gram`
9. `aktivitas_telur_butir`

The statement that gas data has not been trained conflicts with the notebook: the notebook explicitly
includes ammonia and relative MQ-5 values in training. The application follows the current operational
decision that gas inputs are unavailable and deferred. Consequently, the existing `[24, 9]` H5 cannot
consume the seven remaining non-gas features.

Never remove the two gas columns from an H5 input or replace them with zero, null, an average, or another
sensor. Null is not zero. MQ-5 is relative only and must not be displayed or interpreted as ppm.

## Data available now

With both gas inputs deferred, these seven sample columns can support preparation of a future non-gas
pipeline:

- house temperature and humidity;
- drinking-water temperature and TDS;
- water level;
- feed consumption;
- egg activity.

The supplied sample CSV contains 720 hourly rows, no blank cells, and source labels distributed as 639
Normal, 61 Waspada, and 20 Bahaya. Its timestamps contain no timezone offset. They must remain
timezone-unspecified during analysis and must not be silently persisted as UTC.

These CSV fields are not automatically equivalent to live telemetry. In particular, feed weight is not
feed consumption, water flow/total is not water level, and the current telemetry contract has no TDS or
egg-count field. A field mapping must be defined before live integration.

## Evaluation limitation

The notebook reports about 94% accuracy on 120 test sequences, but the class-level result is unsuitable
for alerts:

| Class   | Test support | Recall |
| ------- | ------------ | ------ |
| Normal  | 113          | 100%   |
| Waspada | 6            | 0%     |
| Bahaya  | 1            | 0%     |

The model missed every Waspada and Bahaya example in that test split. Overall accuracy is dominated by
the Normal class and must not be presented as evidence that the model detects mortality risk.

## Current API behavior

Both NestJS and the Vercel Next.js runtime expose the same safe status:

| Method | Route                           | Result                                                                      |
| ------ | ------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/api/v1/mortality/model`       | Loads and verifies the H5 weights; reports `MODEL_INPUTS_UNAVAILABLE`       |
| POST   | `/api/v1/mortality/diagnostics` | HTTP 409; no public inference while gas inputs and fitted scaler are absent |
| POST   | `/api/v1/mortality/predict`     | HTTP 409 with `mortality_prediction: null`                                  |

The status reports the known feature order, labels, seven available non-gas fields, two deferred gas
fields, the missing fitted scaler, unknown source timezone, and zero recall for both risk classes.
Inputs and results are not persisted.

The dashboard `/mortality` shows data readiness and the evaluation limitation. It has no upload or
“run prediction” control. Numerical H5 inference remains covered only by internal conversion-fidelity
tests.

## Safe next options

There are two valid implementation paths:

1. To focus on current data, train and validate a new model with input shape `[24, 7]`, fit and retain a
   new seven-feature scaler, define the timestamp/timezone contract, and demonstrate useful recall for
   Waspada and Bahaya before enabling alerts.
2. To retain the current H5, wait for validated ammonia and relative MQ-5 inputs and obtain the exact
   fitted `scaler_mortalitas.pkl`. Re-evaluate the model before operational use.

Adding gas data later does not repair the zero risk-class recall by itself. Either path still requires
better validation and likely class-imbalance treatment.

## Model artifact verification

- Source SHA-256: `4f07f364137a54a655a260743fc2b0526ba0914bc9fe2ebc049eabbb98112982`.
- Keras version stored in H5: 3.13.2; training backend: TensorFlow.
- Runtime: TensorFlow.js 4.22.0 CPU backend.
- Exported weights are checksum-verified at runtime.
- Five synthetic windows are compared with the original H5 loaded by Keras, with absolute tolerance
  `1e-5`. These tests verify conversion fidelity, not poultry prediction accuracy.

Run the repository checks with:

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

The existing Vercel project is `web`, rooted at `apps/web`. No model-related secret is required.
Deployment remains pending until the Vercel CLI is authenticated.

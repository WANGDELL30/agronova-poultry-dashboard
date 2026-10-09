# AgroNova Poultry AI IoT project rules

These rules apply permanently to every change in this repository.

## Sensor data integrity and semantics

- Never display MQ-5 measurements as ppm until calibration using certified reference gas has been completed.
- MQ-5 may currently be represented only as raw ADC, filtered ADC, ADC voltage, relative percentage, and relative status.
- Store raw and filtered sensor readings separately.
- Store timestamps in UTC and convert them only for display.
- Preserve both device `captured_at` and backend `received_at` timestamps.
- Null sensor values are not equivalent to zero.
- Distinguish `NOT_INSTALLED`, `DISCONNECTED`, `INVALID`, `STALE`, `CALIBRATING`, `VALID`, `DEVICE_OFFLINE`, and `UNKNOWN`.
- Device online/offline state will be derived by the backend from `last_seen_at`.

## Telemetry contracts

- All telemetry payloads must have `schema_version`, `message_id`, `device_id`, `sequence_no`, and `captured_at`.
- Simulator and ESP32 must eventually use the same MQTT topics and telemetry schema.

## Vision (chicken stress detection)

- Vision output is decision support for farm staff, not a diagnosis. The UI must show the model's
  label, confidence, and quality-gate status without implying certainty.
- `skipped_quality`, `parse_error`, `inference_error`, and label `undefined` are never equivalent to
  `not_stress`. Frames without a classification have `result: null`.
- The SCS rule (stress when at least 3 indicators are `YA` and at least 5 of 7 are visible) and the
  temporal voting window (5 frames, confidence >= 0.6, alert at >= 3 stress votes) mirror the
  training notebook. Do not change these constants without re-evaluating the model and updating
  `packages/vision-schema` and `apps/inference/app/scs.py` together.
- `packages/vision-schema` is the single contract between the API, the inference service, and the
  web app. Keep the Python response and the Zod schema in sync.
- Store `captured_at` (camera) and `received_at` (backend) in UTC for every frame.
- Never commit uploaded frames (`apps/api/data/`), Hugging Face tokens, inference API keys, or
  tunnel URLs. Model weights and datasets live on Hugging Face / Roboflow, not in this repository.
- The inference service is a separate Python process by design (GPU and model dependencies). This
  is the only service boundary beyond the API; do not split further without measurements.

## Engineering discipline

- Use database migrations for schema changes.
- Never commit passwords, API keys, MQTT credentials, or other secrets.
- Use strict TypeScript.
- Keep modules small and organized by domain.
- Do not introduce microservices unless scale measurements justify them.
- Do not implement features outside the active development phase.
- Run checks relevant to every change and report any check that could not be run.

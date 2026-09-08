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

## Engineering discipline

- Use database migrations for schema changes.
- Never commit passwords, API keys, MQTT credentials, or other secrets.
- Use strict TypeScript.
- Keep modules small and organized by domain.
- Do not introduce microservices unless scale measurements justify them.
- Do not implement features outside the active development phase.
- Run checks relevant to every change and report any check that could not be run.

# Architecture

## System shape

AgroNova is a pnpm TypeScript monorepo. Its deployable applications are isolated from one another,
and cross-application contracts live in focused shared packages.

| Component                   | Responsibility                                                            | Direct dependencies                 |
| --------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| `apps/web`                  | Responsive operator interface and backend health presentation             | HTTP API only                       |
| `apps/api`                  | Backend boundary, health endpoint, PostgreSQL check, vision orchestration | PostgreSQL, inference service, disk |
| `apps/inference`            | Image quality gate, Qwen3-VL + LoRA classification, SCS rule (Python)     | Hugging Face model repositories     |
| `apps/simulator`            | Future development telemetry source; idle in Phase 1                      | Shared telemetry contract           |
| `packages/telemetry-schema` | Versioned Zod validation, inferred TypeScript types, enums, and example   | Zod                                 |
| `packages/vision-schema`    | Versioned vision result, vote, and inference response contract            | Zod                                 |
| TimescaleDB                 | Future durable telemetry and operational data store                       | API only                            |
| Eclipse Mosquitto           | Future MQTT transport for simulator and devices                           | Future API ingestion and publishers |

The TypeScript side is a modular monolith, not a collection of microservices. The API will gain bounded
domain modules as requirements arrive. A single backend keeps operations and consistency simple
until measured scale demonstrates a need to split it.

The one deliberate exception is `apps/inference`. It is a separate Python process because it needs
PyTorch, a GPU, and several GB of model weights, none of which belong in the Node.js API. It is
not a scale-driven split: it is a runtime boundary, and it is the only service boundary beyond the
API.

## Dependency boundaries

```text
Browser -> Next.js web -> NestJS/Fastify API -> PostgreSQL/TimescaleDB

Vision path:
Browser -> Next.js web -> NestJS/Fastify API -> Inference service (FastAPI) -> Hugging Face weights
                                |
                                +-> image store (disk) + vision result repository

Future telemetry path:
Simulator or ESP32 -> Mosquitto -> API ingestion -> shared validation -> TimescaleDB
```

- The browser never connects to PostgreSQL, MQTT, or the inference service.
- The web application treats the API as its only data boundary.
- The simulator and eventual ESP32 firmware must publish the same versioned payload shape to the
  same topic convention.
- The API is responsible for validating untrusted telemetry before persistence.
- Shared packages contain contracts, not application orchestration or infrastructure access.
- `packages/vision-schema` is the single contract between the API, the web app, and the inference
  service. The Python response model must stay in sync with its Zod schema.

## Vision pipeline (chicken stress detection)

A frame is uploaded from the web app to `POST /api/v1/vision/frames` together with a camera ID, an
optional house (kandang) ID, and the device capture time. The API then:

1. validates the multipart request (one JPEG, PNG, or WebP image, size-limited) and its metadata;
2. stores the original image and stamps `received_at` in UTC;
3. calls the inference service (`POST /v1/classify`) with a timeout and an optional `X-API-Key`;
4. evaluates the temporal vote for that camera and persists the result.

The inference service runs three stages and returns a `status` with a nullable `result`:

1. **Quality gate.** Blur, brightness, and blank-frame checks. A failing frame gets one round of
   enhancement (CLAHE, denoising, sharpening); if it still fails the status is `skipped_quality`.
2. **VLM.** Qwen3-VL-4B-Instruct with the LoRA adapter published on Hugging Face answers `YA`,
   `TIDAK`, or `TIDAK_TERLIHAT` for seven Stressed Chicken Scale indicators.
3. **SCS rule.** `stress` when at least 3 indicators are `YA`; `undefined` when fewer than 5 of 7
   indicators are visible; otherwise `not_stress`.

The API then applies a **temporal vote**: a window of the last 5 accepted frames per camera, a
minimum confidence of 0.6, and an alert when `stress` is the majority with at least 3 votes. The
window is rebuilt from stored records, so it does not depend on in-process state.

The thresholds are ported unchanged from the training notebook. They are defined in
`packages/vision-schema` (TypeScript) and `apps/inference/app/scs.py` (Python) and must be changed
together, only after re-evaluating the model.

### Vision data semantics

- Frames without a classification have `result: null`. `skipped_quality`, `parse_error`,
  `inference_error`, and the label `undefined` are never equivalent to `not_stress` and never enter
  the voting window.
- `confidence` is `null` when the label is `undefined`, instead of an invented number.
- `captured_at` (camera) and `received_at` (backend) are both stored in UTC and converted only for
  display.
- The raw model response is preserved alongside the parsed result.
- Output is decision support for farm staff, not a diagnosis.

### Inference modes and deployment

| Mode   | Use                                                           | Requirement                |
| ------ | ------------------------------------------------------------- | -------------------------- |
| `mock` | Development and tests; deterministic, does not read the image | None                       |
| `real` | Actual classification                                         | GPU with about 8-9 GB VRAM |

`GET /health` on the inference service returns 503 until the model is fully loaded, so readiness is
reported honestly. Real mode can run in Docker (`inference-gpu` profile) or on a free Colab/Kaggle
GPU behind a tunnel for demonstrations. A tunnel URL is public: protect it with `INFERENCE_API_KEY`.

### Current limitations

- Vision results are stored in an in-memory repository and are lost when the API restarts. A
  PostgreSQL repository behind the same interface and a migration are the next step.
- Frames are uploaded manually from the web app. There is no camera capture or edge device path yet.
- Vote alerts are shown in the vision view only; they are not connected to the alert lifecycle
  planned for Phase 4.
- There is no authentication on the vision endpoints.

## Health behavior

`GET /api/v1/health` reports the application state, current UTC server timestamp, application
version, and a real PostgreSQL connectivity status. A failed or absent database configuration makes
the response `degraded`; it is never replaced with a mock success. The endpoint remains HTTP 200 so
operators and the Phase 1 UI can inspect component status even when a dependency is down.

## Telemetry contract decisions

Schema version 1 uses a UUID message identity, device identity, monotonic sequence number, and a UTC
capture time. Raw and filtered readings remain separate. Nullable readings preserve the difference
between absent data and a numeric zero. Quality and calibration use explicit enums.

MQ-5 data is deliberately limited to raw ADC, filtered ADC, ADC voltage, relative percentage, and
quality/calibration status. No ppm representation is permitted before certified reference-gas
calibration.

When ingestion is implemented, the backend will add and preserve `received_at` in UTC. Device
online/offline state will be derived from `last_seen_at`, not trusted from a device payload.

## Infrastructure

Docker Compose supplies a PostgreSQL 16-compatible TimescaleDB image and Eclipse Mosquitto 2. The
inference service is available as opt-in Compose profiles (`inference` for mock, `gpu` for real)
and is not started by `docker compose up -d`. All services have health checks, a private project network, configurable host ports, restart policies, and
explicitly named persistent volumes. Mosquitto permits anonymous access only for Phase 1 local
development and must not be exposed to an untrusted network. Authentication and TLS belong in a
later integration/security phase.

Database changes will be applied through migrations once the persistence model is introduced; no
application is allowed to mutate schema ad hoc.

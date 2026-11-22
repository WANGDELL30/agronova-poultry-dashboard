# Development phases

Work must remain inside the active phase. Each phase should finish with tests, documentation, and a
review of sensor-data integrity rules before the next begins.

**Active phase: Phase 1**, with the authorized extensions listed under it (decision 2026-11-13,
AUDIT DOC9). The vision track runs in parallel. Anything from Phase 2 onwards that is not one of
those extensions stays out of scope until the phase is started.

## Phase 1 — Project foundation (active)

### Authorized extension: mortality model integration (2026-09-16)

The user requested backend/frontend integration of `model_mortalitas_lstm.h5` and a Vercel update.
This bounded extension adds shared server inference, model readiness, and explicit technical input
tests. The training notebook confirms 24 hourly steps, 9 ordered features, and the classes Normal,
Waspada, and Bahaya. Two required gas inputs are deferred, the fitted scaler is absent, and notebook
evaluation has zero recall for both risk classes. Operational predictions remain disabled. The page
focuses on readiness of the seven non-gas fields. This does not activate telemetry ingestion, farm
records, alerts, or other later phases.

See [mortality-model.md](mortality-model.md) for the contract, limits, and deployment procedure.

### Authorized extension: HTTP telemetry ingestion (2026-10-27)

`POST /api/v1/telemetry` accepts one schema-v1 reading, validates it, and keeps the latest reading per
device in memory; `GET /api/v1/telemetry/latest` serves it (204 until a reading exists). The API keeps
the device `captured_at` and its own `received_at`, and is idempotent per `message_id`. This is HTTP
ingest only: it does not activate persistence or the rest of Phase 2.

### Authorized extension: HTTP telemetry through Cloudflare Tunnel (2026-11-20)

Decided with the infrastructure owner on 2026-11-20: devices send telemetry over HTTP through a
Cloudflare Tunnel, and MQTT is not used. The Mosquitto broker was removed. To make the tunnel
safe, `POST /api/v1/telemetry` accepts per-device keys (`TELEMETRY_DEVICE_KEYS`, header
`X-Device-Key`), PostgreSQL and inference listen on the local machine only, and the API can trust
the local cloudflared proxy (`API_TRUST_PROXY`). Device keys authenticate ingest only; user
authentication, roles, and persistence stay in later phases. On 2026-11-22, at the user's request,
`AGENTS.md` was changed from "the same MQTT topics" to "the same HTTP endpoint"; confirmation of that
permanent-rule change by the repository owner is still pending.

Also decided on 2026-11-20: Docker is not used. Demos run inference on Colab; the pilot clones the
repository onto an always-on private GPU server and runs every service directly (uvicorn and Node
under systemd). Docker Compose and the inference Dockerfile were removed.

### Authorized extension: vision upload protection (2026-11-22)

Requested by the user on 2026-11-22 (AUDIT S2, S7, S11); confirmation by the repository owner is still
pending. Camera frames arrive automatically from a camera or gateway; users can still upload a photo
from the dashboard to try a prediction. `POST /api/v1/vision/frames` therefore distinguishes two
sources: a frame with a valid `X-Camera-Key` (`VISION_CAMERA_KEYS`) is a `camera` frame and votes; a
keyless upload, while camera keys are set, is `manual`: classified and shown, but never voting or
raising an alert. Keyless uploads are rate limited per IP and in total, cameras by a minimum
interval, and stored records and images are capped per source. Form fields are limited and the
image content must match its declared type. Without camera keys every upload stays a camera frame,
so demos without a gateway keep working. This is upload authentication only: user accounts and
roles stay in Phase 4, and the camera gateway itself is not part of this extension.

### Authorized extension: optional detector crop in inference (2026-11-22)

Requested by the user on 2026-11-22 (AUDIT P2); confirmation by the repository owner is still pending.
`INFERENCE_DETECTOR=crop` runs a COCO YOLO11s detector with tuned settings before the quality gate and
sends the largest detected chicken, cropped with the training rule, to the VLM; the response and record
carry `detection`. It is off by default because the full frame was more accurate on the dataset, and
it is meant to be evaluated on pilot frames. Ultralytics (AGPL-3.0) is an optional dependency. This
adds no status: a frame without a detection is classified on the full frame, never marked as having
no chicken.

### Authorized extension: operations modules (2026-10-28)

The seven operations pages (`live`, `history`, `alerts`, `devices`, `calibration`, `exports`,
`settings`) show live API telemetry where it exists; controls that belong to later phases are shown
disabled. This does not activate the Phase 4 alert lifecycle or device management.

### Authorized extension: snapshot export (2026-10-28)

`/exports` downloads the current telemetry snapshot as JSON or CSV in the browser. It exports what the
dashboard already shows; there is no server-side export or history archive.

### Authorized extension: WhatsApp bot (2026-11-17)

Requested by the user on 2026-11-17; confirmation by the repository owner is still pending. A
separate app, `apps/whatsapp-bot`, reads the existing API over HTTP `GET` and uses the WhatsApp Cloud
API to send warnings (device offline, sensor disconnected/invalid, vision vote alert) and to answer
free-text questions about the house. No existing application or package code was changed. Device
control is recognised but answered with "not available": there are no actuators and no command path.
This does not activate the Phase 4 alert lifecycle, threshold policies, authentication, MQTT, or
persistence; the bot keeps its state in memory. See
[`apps/whatsapp-bot/README.md`](../apps/whatsapp-bot/README.md).

- pnpm TypeScript monorepo and consistent quality tooling
- Next.js web shell with honest backend health rendering
- NestJS/Fastify API with PostgreSQL-aware health endpoint
- Version 1 telemetry contract, validation, example, and tests
- Idle simulator application
- Optional local PostgreSQL for the health check (Docker and Mosquitto removed on 2026-11-20)
- Architecture, workflow, and permanent engineering rules

Apart from the authorized extensions above, no persistence schema, user authentication,
alert lifecycle, or physical device integration is part of this phase.

## Vision track — chicken stress detection (in progress)

A parallel track that does not depend on telemetry ingestion. It reuses the same rules for UTC
timestamps, nullable values, and explicit status enums.

Delivered:

- Model training and evaluation notebooks (`training/`) and the LoRA adapter on Hugging Face
- `packages/vision-schema` contract with validation and tests
- `apps/inference` FastAPI service (quality gate, Qwen3-VL + LoRA, SCS rule) with mock and real
  modes, tests, and a parity check against the inference notebook 04
- API vision module: upload, inference client with timeout and API key, temporal voter, image
  store, and results endpoints
- Web `/vision` page with upload, per-indicator results, quality status, vote status, and mock mode
- Colab notebook and uvicorn/systemd instructions for running the real model

Next:

- Replace the in-memory repository with PostgreSQL through a migration
- Authentication and authorization for the vision endpoints
- Connect vote alerts to the Phase 4 alert lifecycle
- Camera or edge capture path (frame capture, on-device quality scoring, retries)
- Model monitoring: confidence distribution, skipped-frame rate, and re-evaluation on new farm data

Out of scope until separately approved: automated actions based on vision output, and any claim of
diagnostic accuracy beyond the evaluation reported with the model.

## Phase 2 — Telemetry persistence

- Keep HTTP as the only telemetry transport (decision 2026-11-20); there is no MQTT topic contract
- Send schema-versioned data from the simulator to the same HTTP endpoint as the ESP32
- Add migration tooling and an initial TimescaleDB telemetry schema
- Preserve `captured_at` and backend-generated `received_at`
- Track sequence gaps, validation failures, `last_seen_at`, and derived device availability
- Add unit and integration coverage for ingestion and persistence

Recommended entry point: agree on the database migration tool, then design the ingestion transaction
around the existing shared schema and HTTP endpoint.

## Phase 3 — Live and historical monitoring

- Current environmental summaries and device state
- Time-range APIs and efficient TimescaleDB queries
- Responsive historical charts with explicit missing/stale states
- Farm, house, and device organization
- Observability for ingestion lag and malformed messages

## Phase 4 — Alerting and operations

- Versioned threshold policies and alert lifecycle
- Acknowledgement and audit history
- In-application notification workflows
- CSV exports with UTC source timestamps and explicit display timezone
- Role-based access and production-ready authentication

WhatsApp integration beyond the authorized extension above (device control, alert lifecycle,
persisted notification settings) remains out of scope until a separately approved phase.

## Phase 5 — ESP32 integration and production hardening

- Real hardware sending through the same schema and HTTP endpoint as the simulator
- Device provisioning, per-device key rotation, and TLS certificate handling on the ESP32
- Calibration workflow and traceable calibration records
- Store-and-forward behavior, reconnect testing, and clock-drift handling
- Backups, recovery exercises, security review, deployment automation, and load testing

MQ-5 ppm values remain prohibited until calibration with certified reference gas is completed and
the resulting conversion is reviewed and documented.

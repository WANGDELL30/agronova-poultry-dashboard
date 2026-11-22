# Architecture

## System shape

AgroNova is a pnpm TypeScript monorepo. Its deployable applications are isolated from one another,
and cross-application contracts live in focused shared packages.

| Component                   | Responsibility                                                                                                                                    | Direct dependencies                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web`                  | Responsive operator interface and backend health presentation; mortality Route Handlers (`app/api/v1/mortality/*`) on Vercel                      | HTTP API, `packages/mortality-model` (server only)              |
| `apps/api`                  | Backend boundary, health endpoint, PostgreSQL check, vision orchestration, telemetry module (HTTP ingest, device keys, latest reading), mortality | PostgreSQL, inference service, disk, `packages/mortality-model` |
| `apps/inference`            | Image quality gate, Qwen3-VL + LoRA classification, SCS rule (Python)                                                                             | Hugging Face model repositories                                 |
| `apps/simulator`            | Future development telemetry source; idle in Phase 1                                                                                              | Shared telemetry contract                                       |
| `packages/telemetry-schema` | Versioned Zod validation, inferred TypeScript types, enums, and example                                                                           | Zod                                                             |
| `packages/vision-schema`    | Versioned vision result, vote, and inference response contract                                                                                    | Zod                                                             |
| `packages/mortality-model`  | Checksum-verified LSTM mortality artifact and server-side runtime, shared by the API and the web Route Handlers                                   | TensorFlow.js, Zod                                              |
| TimescaleDB                 | Future durable telemetry and operational data store                                                                                               | API only                                                        |

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

Current live telemetry path:
ESP32 -> HTTPS -> Cloudflare Tunnel -> API (device key, shared-schema validation) -> volatile latest-reading store
Browser -> HTTPS polling -> Cloudflare Tunnel -> API latest-reading endpoint

Target persistent telemetry path:
Simulator or ESP32 -> HTTP POST -> API ingestion -> shared validation -> TimescaleDB
```

- The browser never connects to PostgreSQL or the inference service.
- The web application treats the API as its only data boundary.
- Telemetry arrives over HTTP only. MQTT is not used (decision 2026-11-20): devices post to
  `POST /api/v1/telemetry`, reached through a Cloudflare Tunnel that terminates TLS.
- The simulator and eventual ESP32 firmware must send the same versioned payload shape to the same
  HTTP endpoint.
- The API is responsible for validating untrusted telemetry before persistence.
- Shared packages contain contracts, not application orchestration or infrastructure access.
- `packages/vision-schema` is the single contract between the API, the web app, and the inference
  service. There is no Pydantic model on the Python side (decision 2026-11-13, AUDIT K3): the
  Python response is a plain dict, and the contract is enforced by the Zod schema in the API plus
  tests (the cross-field invariants of K2 and the notebook/prompt checks of P8).

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

The API then applies a **temporal vote**: every classified frame labelled `stress` or `not_stress` is
a vote, with no confidence filter. The window holds the last 5 votes per camera, and an alert is
raised when `stress` is the majority with at least 3 votes. `undefined` is reported as
`ignored_undefined` and frames without a result as `ignored_no_result`; neither enters the window.
The window is rebuilt from stored records, but those records are held in memory (the Postgres
repository is deferred), so the window is in-process state and is lost when the API restarts. Dropping the
confidence >= 0.6 filter is a deliberate deviation from the voter in inference notebook 04 (decision
2026-11-13, AUDIT K1/V1): with confidence = YA/7, stress frames with 3-4 `YA` never became votes.

The SCS thresholds match the training notebook and inference notebook 04
(`training/vlm-workflow/inference-vlm-lora-huggingface.ipynb`). The voting constants come only from the voter in inference notebook
04, which the API deliberately deviates from since K1 (see above). They are defined in
`packages/vision-schema` (TypeScript) and `apps/inference/app/scs.py` (Python) and must be changed
together, only after re-evaluating the model.

The service system prompt (`apps/inference/app/scs.py`, same as notebook 04) deliberately differs
from the training prompt (`_meta.system_prompt` in `results/vlm/vlm_experiments.json`), decision
2026-11-14, AUDIT P1. The metrics in `results/vlm` were measured with the training prompt, not with
the service. Service accuracy measured on a T4 (2026-11-14, small samples): 16/17 labelled crops and
33/47 full frames. The training prompt scored 15/17 on the same crops, which is not a meaningful
difference at n = 17.

### Vision data semantics

- Frames without a classification have `result: null`. `skipped_quality`, `parse_error`,
  `inference_error`, and the label `undefined` are never equivalent to `not_stress` and never enter
  the voting window.
- `confidence` is `null` when the label is `undefined`, instead of an invented number. It measures
  severity (YA/7 for `stress`, 1 - YA/7 for `not_stress`), not model certainty, and is not used for
  voting.
- `captured_at` (camera) and `received_at` (backend) are both stored in UTC and converted only for
  display.
- The raw model response is stored for every frame with model output (`classified` and
  `parse_error`), alongside the parsed result (decision 2026-11-13, AUDIT K4).
- Output is decision support for farm staff, not a diagnosis.

### Upload sources and limits (AUDIT S2, S7, S11)

Every record has a `source`. A frame sent with a valid `X-Camera-Key` (`VISION_CAMERA_KEYS`,
`camera_id=key` pairs) is a `camera` frame; the key must belong to the frame's `camera_id` (else 403
`camera_id_mismatch`), and an unknown key is 401 `invalid_camera_key` before the body is read. A
keyless upload is `manual` while camera keys are set: it is classified and shown, but its vote is
`ignored_manual`, it never enters a window and never raises an alert, so a dashboard visitor cannot
fake a stress alert for a real camera. Without camera keys every upload is a `camera` frame, which
keeps demos without a camera gateway working.

Keyless uploads are limited per client IP and in total per sliding hour (default 10 and 60), an
authenticated camera by a minimum interval between frames (default 10 s); both answer 429
`upload_rate_limited` with `Retry-After`. Records and their images are capped per source (default
2000 camera, 200 manual); the oldest are deleted first. The form accepts only `camera_id`,
`kandang_id`, `captured_at`, and one image, with short fields, and the file must start with the
signature of its declared type (JPEG, PNG, WebP), else 415. Stored images are served with
`X-Content-Type-Options: nosniff`.

`camera_id` and `kandang_id` are trimmed and may only use letters, digits, `.`, `_` and `-` (at most
64 characters), so `"cam-A "` and `"cam-A"` share one voting window; the ids in `VISION_CAMERA_KEYS`
are checked against the same rule at startup. `captured_at` may not be earlier than
`2020-01-01T00:00:00Z` (a camera without a set clock sends 1970) or more than 5 minutes after
`received_at`; both answer 400 `invalid_metadata` (AUDIT R8). There is no maximum age, because a
manual upload uses the photo's file date; the web form sends the upload time instead when that date
is missing, in the future, or before 2020.

### Inference modes and deployment

| Mode   | Use                                                           | Requirement                |
| ------ | ------------------------------------------------------------- | -------------------------- |
| `mock` | Development and tests; deterministic, does not read the image | None                       |
| `real` | Actual classification                                         | GPU with about 8-9 GB VRAM |

`GET /health` on the inference service returns 503 until the model is fully loaded, so readiness is
reported honestly. There is no container image (decision 2026-11-20): real mode runs with uvicorn
on a free Colab/Kaggle GPU behind a tunnel for demonstrations, or on an always-on GPU server under
systemd for the pilot. Real mode refuses to start without `INFERENCE_API_KEY` (AUDIT S4), so a
public tunnel URL alone never reaches the model. `/health` reports a failed load with a generic
message; the exception itself is only in the service log (AUDIT S12). A failed model
load leaves the service up with `/health` reporting `error`; `INFERENCE_EXIT_ON_LOAD_ERROR=true`
exits instead, for use only under a supervisor that restarts it.

An optional detector (`INFERENCE_DETECTOR=crop`, off by default; AUDIT P2) crops the largest detected
animal with the training rule before the quality gate, and the response and record then carry
`detection` (crop or full frame, box, confidence). On the dataset the full frame was more accurate
than any crop (decision 2026-11-22), so it stays off until it is evaluated on pilot frames. It needs
the optional `requirements-detector.txt` (Ultralytics, AGPL-3.0). See `apps/inference/README.md`.

### Current limitations

- Vision results are stored in an in-memory repository and are lost when the API restarts. A
  PostgreSQL repository behind the same interface and a migration are the next step.
- The API accepts camera frames with `X-Camera-Key`, but the camera gateway (capture, retries,
  on-device quality scoring) does not exist yet; frames are uploaded from the web app or `curl`.
- Vote alerts are shown in the vision view only; they are not connected to the alert lifecycle
  planned for Phase 4.
- Upload authentication is per camera only; reading results (`GET /vision/results`) is open, and
  there are no user accounts (Phase 4).

## Health behavior

`GET /api/v1/health` reports the application state, current UTC server timestamp, application
version, and a real PostgreSQL connectivity status. A failed or absent database configuration makes
the response `degraded`; it is never replaced with a mock success. The endpoint remains HTTP 200 so
operators and the Phase 1 UI can inspect component status even when a dependency is down.

## Telemetry contract decisions

Schema version 1 uses a UUID message identity, device identity, monotonic sequence number, and a UTC
capture time. `message_id` may be any 8-4-4-4-12 hex id (`z.guid()`): the RFC 9562 version and variant
bits are not checked, so firmware that fills it with random hex is accepted. `captured_at` is ISO 8601
in UTC with a `Z` suffix and seconds (`2026-01-01T00:00:00Z`, fractions allowed). Raw and filtered readings remain separate. Nullable readings preserve the difference
between absent data and a numeric zero. Quality and calibration use explicit enums.

MQ-5 data is deliberately limited to raw ADC, filtered ADC, ADC voltage, relative percentage, and
quality/calibration status. No ppm representation is permitted before certified reference-gas
calibration.

The HTTP ingestion endpoint adds and preserves `received_at` in UTC. Device online/offline state is
derived from `last_seen_at`, not trusted from a device payload. The current latest-reading store is
volatile; durable history still requires a migration and TimescaleDB repository.

When `TELEMETRY_DEVICE_KEYS` is set, each device authenticates with its own key in the
`X-Device-Key` header. The key is checked before the body (401 `invalid_device_key`), and a key may
only write its own `device_id` (403 `device_id_mismatch`), so a leaked key cannot overwrite another
device and unregistered device ids are never stored (AUDIT S15). Empty `TELEMETRY_DEVICE_KEYS`
leaves ingest open and logs a warning at startup; that is acceptable only while the API is not
reachable from outside the machine. Memory stays bounded either way: at most 100 devices are kept,
and a new device id beyond that forgets the device that reported least recently. Reads (`GET /telemetry/latest`) stay open for the dashboard.

## Infrastructure

Docker is not used (decision 2026-11-20). The API and web app run with Node; the inference
service runs with uvicorn, on Colab for demos or on an always-on GPU server for the pilot,
where systemd starts each service at boot and restarts it after a crash. Inference listens on
`127.0.0.1` and PostgreSQL, when installed, on `localhost` only (AUDIT S4, S6): the API on the same
machine is the only caller. PostgreSQL is optional today because only the health check reads it;
durable telemetry (Phase 2) will need a natively installed PostgreSQL/TimescaleDB or a managed one.
The Mosquitto broker was removed with the decision to use HTTP only (2026-11-20, closes AUDIT S5).

The API is exposed through a Cloudflare Tunnel (named tunnel on a fixed hostname), which provides
TLS. Only the API port is routed; inference and PostgreSQL never are. With cloudflared on the same
machine, `API_HOST=127.0.0.1` and `API_TRUST_PROXY=127.0.0.1,::1` make the API unreachable except
through the tunnel and let `request.ip` show the real client (AUDIT D17).

Database changes will be applied through migrations once the persistence model is introduced; no
application is allowed to mutate schema ad hoc.

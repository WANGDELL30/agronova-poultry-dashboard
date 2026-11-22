# AgroNova Poultry AI IoT

Monitoring dashboard for laying-hen farms. The repository is a strict TypeScript monorepo with a
responsive bilingual Next.js dashboard, a NestJS/Fastify API, a telemetry simulator placeholder,
shared Zod schemas, a Python inference service for **chicken stress detection from images**, the
notebooks used to train and evaluate the model, and local TimescaleDB infrastructure.

## Current scope

| Area                        | Status                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Overview dashboard          | Live API polling by default; waits without fabricating values until data arrives                |
| HTTP telemetry ingestion    | `POST /api/v1/telemetry`, schema-v1 validated, per-device keys; latest reading in memory        |
| Vision (stress detection)   | Working end to end: upload frame → quality gate → VLM → SCS rule → temporal vote                |
| Telemetry persistence, MQTT | **Not implemented / not used.** No sensor data is stored; devices post over HTTP only           |
| Vision result persistence   | **In-memory only.** Results are lost when the API restarts                                      |
| Real ESP32 devices, alerts  | HTTP contract ready; ESP32 firmware still needs to post telemetry                               |
| Operations modules          | Seven modules render the same live telemetry as the overview; later-phase controls are disabled |
| Snapshot export             | `/exports` downloads the current snapshot as JSON or CSV; history export is disabled            |
| Notifications               | Not implemented in the dashboard                                                                |
| WhatsApp bot                | Separate app (`apps/whatsapp-bot`): warnings and Q&A; device control answered "not available"   |

## How stress detection works

```text
Web (/vision) ──multipart image──▶ API (NestJS) ──▶ Inference (FastAPI)
                                       │                  │
                                       │                  ├─ 1. Quality gate (blur / brightness / blank), light enhancement
                                       │                  ├─ 2. Qwen3-VL-4B-Instruct + LoRA adapter (Hugging Face)
                                       │                  └─ 3. SCS rule on 7 indicators
                                       └─ 4. Temporal vote over the last 5 accepted frames per camera
```

1. **Quality gate.** Blurry, too dark, too bright, or blank frames are enhanced once; if they still
   fail they are returned as `skipped_quality`.
2. **VLM.** The model answers `YA`, `TIDAK`, or `TIDAK_TERLIHAT` for each of 7 Stressed Chicken
   Scale indicators (tail, head, eyes, beak, wings, legs/posture, feathers).
3. **SCS rule.** `stress` when at least 3 indicators are `YA`; `undefined` when fewer than 5 of 7
   are visible.
4. **Temporal vote.** Every classified frame labelled `stress` or `not_stress` is a vote, with no
   confidence filter. Window of 5 votes per camera; an alert is raised when `stress` is the majority
   with at least 3 votes. This deliberately deviates from the voter in inference notebook 04, which
   also required confidence >= 0.6 (decision 2026-11-13): there, stress frames with 3-4 `YA` never
   counted.

The result is decision support, not a diagnosis. `skipped_quality`, `parse_error`,
`inference_error`, and `undefined` are never treated as `not_stress`.

The contract shared by all three components is in `packages/vision-schema`. The model adapter is
published at [`Arga23/chickenstress-vlm-lora`](https://huggingface.co/Arga23/chickenstress-vlm-lora)
on Hugging Face; the base model is `Qwen/Qwen3-VL-4B-Instruct`.

The authorized mortality-model extension installs and verifies the supplied LSTM in the backend and
Vercel server runtime. Open `/mortality` for non-gas data readiness and the model's evaluation limits.
Operational prediction is disabled because the H5 requires two deferred gas features, its fitted
scaler is absent, and its notebook evaluation has zero recall for Waspada and Bahaya. See
[the mortality integration guide](docs/mortality-model.md).

## Repository layout

```text
apps/
  api/                      NestJS API (Fastify): health, telemetry, mortality, vision
  inference/                FastAPI service: quality gate, Qwen3-VL + LoRA, SCS rule (Python)
  simulator/                Non-publishing telemetry simulator placeholder
  whatsapp-bot/             WhatsApp warnings and Q&A; reads the API over HTTP (see its README)
  web/                      Next.js App Router frontend
packages/
  telemetry-schema/         Versioned telemetry types, validation, example, and tests
  mortality-model/          Shared server LSTM runtime, weights, and numerical verification
  vision-schema/            Vision result/vote contract (Zod) shared by API, web, and inference
training/                   Notebooks: labeling tool, training/evaluation, HF inference reference
docs/
  architecture.md           Components, boundaries, and intended data flow
  development-phases.md     Phased delivery roadmap
  frontend-design.md        Frontend components, states, and responsive behavior
```

## Prerequisites

- Node.js 22 or later and Corepack (included with Node.js)
- Python 3.11+ for running `apps/inference` on this machine (not needed when it runs on Colab)
- Real model only: an NVIDIA GPU with about 8–9 GB VRAM, or a free Colab/Kaggle GPU (see below)

Docker is not used (decision 2026-11-20). Every service runs directly: the API and web app with
Node, the inference service with uvicorn. PostgreSQL is optional today (only the
health check reads it) and, when wanted, is installed natively.

The repository pins pnpm through the `packageManager` field and lockfile:

```bash
corepack pnpm install --frozen-lockfile
```

## Environment setup

PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/simulator/.env.example apps/simulator/.env
Copy-Item apps/inference/.env.example apps/inference/.env   # only when inference runs on this machine
```

Bash:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/simulator/.env.example apps/simulator/.env
cp apps/inference/.env.example apps/inference/.env   # only when inference runs on this machine
```

`DATABASE_URL` in `apps/api/.env` is commented out; set it only if a PostgreSQL server is installed.
No environment file containing credentials, API keys, or tokens should be committed.

## Run locally

### 1. Frontend only (live waiting state)

```bash
corepack pnpm --filter @agronova/telemetry-schema build
corepack pnpm --filter @agronova/vision-schema build
corepack pnpm --filter @agronova/mortality-model build
corepack pnpm --filter @agronova/web dev
```

The default is `NEXT_PUBLIC_DATA_MODE=api`. Without a reachable API or device reading, `/overview`
shows “waiting for device & sensors” and never substitutes mock values or zeroes. Explicitly set
`NEXT_PUBLIC_DATA_MODE=mock` only for deterministic local UI development; production builds always
use live API mode.

### 2. Full stack with the mock inference service (no GPU)

```bash
corepack pnpm inference:mock          # separate terminal; needs: pip install -r apps/inference/requirements-dev.txt
corepack pnpm dev
```

The web app polls `GET /api/v1/telemetry/latest` every three seconds. A device or gateway sends the
shared schema-v1 JSON payload to `POST /api/v1/telemetry`. The API preserves device `captured_at`
and backend `received_at` separately and derives online state from `last_seen_at`. MQTT is not used
(decision 2026-11-20). When `TELEMETRY_DEVICE_KEYS` is set, each device must send its key in the
`X-Device-Key` header (see [Expose the API through a Cloudflare Tunnel](#expose-the-api-through-a-cloudflare-tunnel)).

### 3. Real model

Real inference on a CPU takes tens of minutes per image. Use one of:

- **NVIDIA GPU on this machine or an always-on GPU server (pilot):** install
  `apps/inference/requirements-real.txt` in a venv, set `INFERENCE_MODE=real` and `INFERENCE_API_KEY`
  in `apps/inference/.env`, and run uvicorn with `--env-file .env` (under systemd on a server). Run
  the parity check and measure the timeout on that GPU first. Steps:
  [`apps/inference/README.md`](apps/inference/README.md#always-on-gpu-server-pilot).

  `GET /health` returns `503` until the model is fully loaded (several minutes on first run).

- **Free GPU on Colab (demo only):** open `apps/inference/colab/run_inference_colab.ipynb`, set the
  runtime to T4 GPU, run all cells, then copy the printed `INFERENCE_URL` and `INFERENCE_API_KEY`
  into `apps/api/.env` and restart the API. The tunnel URL changes on every run.

Measured on a Colab T4 (fp16, 2026-11-14, 68 images): peak VRAM 8.7 GB, model load about 38 s
(plus about 112 s to download it the first time), generation p50 9.8 s / p95 11.2 s per image, and
identical output on 5 of 5 repeated images. Other GPUs need their own measurement.

See [`apps/inference/README.md`](apps/inference/README.md) for the parity check against the
reference inference notebook (`training/vlm-workflow/inference-vlm-lora-huggingface.ipynb`).

### Service addresses

| Service    | URL / address                         | Configuration                                                                                   |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Web        | `http://localhost:3000`               | `PORT=… corepack pnpm --filter @agronova/web dev` or `next dev -p` (not read from `.env.local`) |
| API        | `http://localhost:4000`               | `API_HOST`, `API_PORT`                                                                          |
| Health     | `http://localhost:4000/api/v1/health` | API environment                                                                                 |
| Inference  | `http://localhost:8000`               | uvicorn `--port`, `INFERENCE_URL`                                                               |
| PostgreSQL | `localhost:5432` (optional)           | `DATABASE_URL`                                                                                  |

Run inference with `--host 127.0.0.1` (uvicorn's default) and, if PostgreSQL is installed, keep its
`listen_addresses` on `localhost`: only the API on the same machine calls them (AUDIT S4, S6).

## API endpoints (prefix `/api/v1`)

| Method | Path                        | Purpose                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                   | API and database status (`degraded` when PostgreSQL is unavailable)                                                                                                                                                                                                                                                                                                                           |
| POST   | `/vision/frames`            | Multipart upload: one `image` (JPEG/PNG/WebP by content, up to 8 MB) + `camera_id`, `kandang_id`, `captured_at`. With `X-Camera-Key` a camera frame that votes (401 `invalid_camera_key`, 403 `camera_id_mismatch`); keyless uploads are `manual` while `VISION_CAMERA_KEYS` is set and never vote. 429 `upload_rate_limited` + `Retry-After`                                                 |
| GET    | `/vision/results`           | Recent results, newest first (`camera_id`, `limit` 1–100)                                                                                                                                                                                                                                                                                                                                     |
| GET    | `/vision/results/:id/image` | Stored frame for a result                                                                                                                                                                                                                                                                                                                                                                     |
| GET    | `/vision/health`            | Vision pipeline status                                                                                                                                                                                                                                                                                                                                                                        |
| POST   | `/telemetry`                | Ingest one schema-v1 reading (400 `invalid_telemetry` if invalid). Idempotent per `message_id`: an identical retransmission returns the original receipt with 200; the same id with another payload is 409 `duplicate_message_id`. With `TELEMETRY_DEVICE_KEYS` set: 401 `invalid_device_key` without a valid `X-Device-Key`, 403 `device_id_mismatch` when the key belongs to another device |
| GET    | `/telemetry/latest`         | Latest reading (`device_id` optional); **204** while none is held                                                                                                                                                                                                                                                                                                                             |
| GET    | `/mortality/model`          | Loads and verifies the H5 weights (503 `MODEL_UNAVAILABLE` on failure)                                                                                                                                                                                                                                                                                                                        |
| POST   | `/mortality/predict`        | Always **409** `MODEL_INPUTS_UNAVAILABLE` while gas inputs are deferred                                                                                                                                                                                                                                                                                                                       |
| POST   | `/mortality/diagnostics`    | Always **409** `MODEL_INPUTS_UNAVAILABLE` (same reason)                                                                                                                                                                                                                                                                                                                                       |

Inference service: `GET /health` and `POST /v1/classify` (multipart `file`, optional `X-API-Key`).

## Frontend routes

| Route          | State                                                        |
| -------------- | ------------------------------------------------------------ |
| `/overview`    | Complete responsive overview dashboard                       |
| `/mortality`   | Non-gas readiness; operational prediction disabled           |
| `/vision`      | Image upload, classification, history                        |
| `/live`        | Live telemetry from the shared telemetry provider            |
| `/history`     | Trend of readings received in this browser session           |
| `/alerts`      | Alerts derived from live readings; acknowledge is local only |
| `/devices`     | Device connectivity and sensor readiness                     |
| `/calibration` | Read-only calibration status; actions disabled               |
| `/exports`     | Current snapshot as JSON/CSV; history scope disabled         |
| `/settings`    | Read-only settings; saving disabled                          |

Frontend mock scenarios (`NEXT_PUBLIC_MOCK_SCENARIO`): `normal`, `warning`, `sensor-not-installed`,
`device-offline`. The frontend talks only to the API, never directly to the inference service.

## Training and evaluation

The `training/` folder holds the notebooks behind the model. Suggested order:

1. `training/vlm-workflow/scs_labeling_tool_kaggle_multichicken.ipynb`: label chickens against the 7 SCS indicators.
2. `training/vlm-workflow/chickenstress-kaggle.ipynb`: data balancing, LoRA fine-tuning of
   Qwen3-VL-4B, evaluation, and push of the adapter to Hugging Face.
3. `training/vlm-workflow/inference-vlm-lora-huggingface.ipynb`: reference inference pipeline loaded from Hugging Face.
   `apps/inference` is a port of it, and `apps/inference/scripts/parity_check.py` verifies that both
   produce identical results.

### Dataset and attribution

All training images come from the Roboflow Universe dataset
[**Stressed chicken**, version 19](https://universe.roboflow.com/chicken-stress-detection/stressed-chicken-vgdf1)
("Provided by a Roboflow user"), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). No photos from partner farms are used.
The full raw export (COCO format) is not stored here, but derived images are: the per-chicken crops
under `data/working/dataset/`, image outputs embedded in the training notebooks, and figures and
YOLO batch mosaics under `results/`. These derived images are shared under the same CC BY 4.0
license. Details of the source export are in `docs/manifest/manifest_dataset.md`.

### Deploy the frontend to Vercel

Use the existing Vercel project for `apps/web`; NestJS, the simulator, PostgreSQL, and inference
are not part of this deployment. The mortality server endpoints run as Next.js Route Handlers on
Vercel. The web package builds the shared telemetry schema, vision schema, and mortality runtime before Next.js.

Vercel project settings (to be confirmed by the owner of the Vercel project; they live in the
dashboard, not in this repository):

- **Project:** the existing Vercel project is named `web`.
- **Root Directory:** `apps/web`. Keep the default install and build commands (`pnpm install`,
  `pnpm run build`); no `vercel.json` is needed. `prebuild` (`apps/web/prebuild.mjs`) runs the
  schema builds with the same pnpm that started it, so it works with or without `corepack` on PATH.
- **Node.js:** 22.x, pinned by `engines.node` in `apps/web/package.json`.
- **`ENABLE_EXPERIMENTAL_COREPACK=1`:** optional. The build no longer calls `corepack`; set it only to
  make Vercel use the exact pnpm from `packageManager` (`pnpm@10.15.1`).
- **Do not set `NODE_ENV`** and do not install with `--prod`. The build needs devDependencies
  (`typescript` for every `tsc` build, `@types/*` for `next build`). Vercel skips devDependencies when
  `NODE_ENV=production` is set, and `pnpm install --prod` fails the schema builds with
  `'tsc' is not recognized`, even when `typescript` is declared in each package.
- **Required env:** `NEXT_PUBLIC_API_BASE_URL` (absolute `https:` URL) and `NEXT_PUBLIC_DEVICE_ID`.

Use these public frontend settings in Vercel when an explicit deployment configuration is needed:

```env
NEXT_PUBLIC_DATA_MODE=api
NEXT_PUBLIC_API_BASE_URL=https://your-public-api.example
NEXT_PUBLIC_DEVICE_ID=AGRONOVA-ESP32-01
NEXT_PUBLIC_LIVE_INTERVAL_MS=3000
```

`NEXT_PUBLIC_API_BASE_URL` must be an absolute `https:` URL for a Vercel production build
(`VERCEL_ENV=production`); otherwise `next build` fails with an explicit error. Other builds (local,
preview, root `corepack pnpm build`) only print a warning. If the variable is empty at build time, the
UI shows "API belum dikonfigurasi" / "API not configured" and sends no requests. Run a direct
production deployment from the repository root with:

```bash
corepack pnpm dlx vercel@latest deploy --prod
```

### Expose the API through a Cloudflare Tunnel

Devices and the Vercel dashboard reach the API through a Cloudflare Tunnel that terminates TLS. Use a
named tunnel on a domain managed in Cloudflare, not a `trycloudflare.com` quick tunnel: its URL
changes on every run, and both the Vercel build and the device firmware embed the API URL.

- Route only the API: `api.<domain>` → `http://127.0.0.1:4000`. Never route inference (8000) or
  PostgreSQL (5432).
- In `apps/api/.env`: `API_HOST=127.0.0.1`, `API_TRUST_PROXY=127.0.0.1,::1`, `WEB_ORIGIN` set to the
  dashboard origin, and `TELEMETRY_DEVICE_KEYS` with one key per device.
- In Vercel: `NEXT_PUBLIC_API_BASE_URL=https://api.<domain>`, then redeploy.
- Devices post to `https://api.<domain>/api/v1/telemetry` with the `X-Device-Key` header. Retry
  network errors and 5xx with the same `message_id`; do not retry 400, 401, 403, or 409.
- Set `VISION_CAMERA_KEYS` before cameras or the public dashboard reach the API: then only cameras
  with a key vote, and dashboard uploads are rate-limited manual tests that never raise an alert.
  Without it every upload counts as a camera frame.
- On an always-on server, run the API (`corepack pnpm --filter @agronova/api start` after a build),
  cloudflared, and inference as services that start at boot (systemd on Linux), each with its working
  directory set so `.env` files and `VISION_IMAGE_DIR` resolve to the intended paths.

## Checks and builds

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm build
corepack pnpm inference:test        # Python tests (pytest), needs requirements-dev.txt
```

`inference:mock` and `inference:test` run the `python` found on `PATH`. Activate the inference venv
first, or they use a global Python that may lack the dependencies:

```bash
python -m venv apps/inference/.venv
source apps/inference/.venv/Scripts/activate   # Windows Git Bash; Linux/macOS: .venv/bin/activate
pip install -r apps/inference/requirements-dev.txt
```

Run an individual workspace when needed:

```bash
corepack pnpm --filter @agronova/api dev
corepack pnpm --filter @agronova/web dev
corepack pnpm --filter @agronova/vision-schema test
corepack pnpm --filter @agronova/telemetry-schema test
```

The simulator prints an idle startup message. With `start` (`node dist/index.js`) it then exits
successfully; under `corepack pnpm dev` (`tsx watch`) the watcher keeps running idle. It deliberately
does not send telemetry.

## Environment variable reference

| Variable                       | Purpose                                                                                                                                                | Default / requirement                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `API_HOST`                     | API bind address; `127.0.0.1` when only a tunnel on the same machine reaches it                                                                        | `0.0.0.0`                                        |
| `API_PORT`                     | API port                                                                                                                                               | `4000`                                           |
| `APP_VERSION`                  | Version reported by health                                                                                                                             | `0.1.0`                                          |
| `WEB_ORIGIN`                   | Allowed browser origins, comma-separated; no `*`                                                                                                       | `http://localhost:3000`                          |
| `API_TRUST_PROXY`              | Proxy IPs/CIDRs whose `X-Forwarded-For` is trusted (`127.0.0.1,::1` for cloudflared on the same machine); no `true` or `*`                             | Empty = trust no proxy                           |
| `DATABASE_URL`                 | PostgreSQL connection string used by API health                                                                                                        | Omit to report `not_configured`                  |
| `DATABASE_CONNECT_TIMEOUT_MS`  | Health-query connection timeout                                                                                                                        | `3000`                                           |
| `TELEMETRY_DEVICE_KEYS`        | `device_id=key` pairs, comma-separated; keys >= 16 characters and unique, sent as `X-Device-Key` on `POST /telemetry`                                  | Empty = open ingest; set it before any tunnel    |
| `INFERENCE_URL`                | Inference service base URL used by the API                                                                                                             | `http://localhost:8000`                          |
| `INFERENCE_API_KEY`            | Shared secret (`X-API-Key`) for the inference service                                                                                                  | Empty = no auth; set for tunnels                 |
| `INFERENCE_TIMEOUT_MS`         | API timeout for one inference call. T4 (PV9): (1 + queue 2) × p95 11.55 s × 1.5 ≈ 52 s, rounded up. Re-measure on other GPUs                           | `60000`                                          |
| `INFERENCE_HEALTH_TIMEOUT_MS`  | API timeout for the inference health check                                                                                                             | `5000`                                           |
| `VISION_IMAGE_DIR`             | Where uploaded frames are stored                                                                                                                       | `./data/vision-images`                           |
| `VISION_MAX_IMAGE_BYTES`       | Maximum image size; read by **both** the API and the inference service. Set the same value in `apps/api/.env` and `apps/inference/.env`                | `8388608`                                        |
| `VISION_CAMERA_KEYS`           | `camera_id=key` pairs, comma-separated; keys >= 16 characters and unique, sent as `X-Camera-Key` on `POST /vision/frames`                              | Empty = every upload is a camera frame           |
| `VISION_MANUAL_UPLOADS_*`      | `..._PER_IP_PER_HOUR` and `..._PER_HOUR`: keyless uploads per client IP and in total per sliding hour; above it 429 + `Retry-After`                    | `10` and `60`                                    |
| `VISION_CAMERA_INTERVAL_MS`    | Minimum time between two accepted frames of one authenticated camera; `0` = no minimum                                                                 | `10000`                                          |
| `VISION_MAX_CAMERA_RECORDS`    | Camera records (and images) kept; the oldest are deleted first                                                                                         | `2000`                                           |
| `VISION_MAX_MANUAL_RECORDS`    | Manual records (and images) kept; the oldest are deleted first                                                                                         | `200`                                            |
| `INFERENCE_MAX_IMAGE_PIXELS`   | Inference only: images with more pixels (read from the header) are rejected with 413 `image_too_large` before decoding                                 | `40000000`                                       |
| `INFERENCE_MAX_IMAGE_SIDE`     | Inference only: a longer side above this is downscaled (`INTER_AREA`) before the quality gate; 640 px dataset frames are unchanged                     | `1280`                                           |
| `INFERENCE_MODE`               | Inference backend: `mock` or `real`                                                                                                                    | `mock`                                           |
| `INFERENCE_LOAD_BLOCKING`      | `1` loads the real model synchronously at startup instead of in a background thread                                                                    | unset (background load, `/health` 503 meanwhile) |
| `INFERENCE_LOAD_TIMEOUT_S`     | Seconds the background model load may take before `/health` reports `error`                                                                            | `1800`                                           |
| `INFERENCE_EXIT_ON_LOAD_ERROR` | On a load `error`, exit the process (non-zero). Only useful under a supervisor that restarts it (systemd `Restart=on-failure`)                         | `false`                                          |
| `INFERENCE_MAX_QUEUE`          | Inference only: requests that may wait for the model while one runs; more get 503 `queue_full` + `Retry-After` (API: `inference_busy`, nothing stored) | `2`                                              |
| `HF_ADAPTER_REPO`              | LoRA adapter repository (real mode)                                                                                                                    | `Arga23/chickenstress-vlm-lora`                  |
| `HF_BASE_MODEL`                | Base VLM (real mode)                                                                                                                                   | `Qwen/Qwen3-VL-4B-Instruct`                      |
| `INFERENCE_BASE_REVISION`      | Base model commit (S10/P7). Hub id: loaded at it; local folder: reported only. Empty = no pin                                                          | `ebb281ec70b0…` (T4 parity)                      |
| `INFERENCE_ADAPTER_REVISION`   | Adapter commit, same rules as `INFERENCE_BASE_REVISION`                                                                                                | `51b653173b0e…` (T4 parity)                      |
| `HF_TOKEN`                     | Optional; default adapter is public (private repo only). Alias: `HUGGING_FACE_HUB_TOKEN`                                                               | Never commit                                     |
| `PORT`                         | Next.js web port; process environment only (Next ignores it in `.env*` files)                                                                          | `3000`                                           |
| `NEXT_PUBLIC_API_BASE_URL`     | Browser-visible API base URL (https on Vercel prod)                                                                                                    | none: empty = "API not configured"               |
| `NEXT_PUBLIC_DATA_MODE`        | Frontend data source: `api` or explicit dev `mock`                                                                                                     | `api`                                            |
| `NEXT_PUBLIC_DEVICE_ID`        | Optional live device filter                                                                                                                            | all devices                                      |
| `NEXT_PUBLIC_LIVE_INTERVAL_MS` | Live telemetry polling interval                                                                                                                        | `3000`                                           |
| `DEVICE_OFFLINE_AFTER_MS`      | API threshold derived from `last_seen_at`                                                                                                              | `30000`                                          |
| `NEXT_PUBLIC_MOCK_SCENARIO`    | Deterministic frontend simulation scenario                                                                                                             | `normal`                                         |
| `NEXT_PUBLIC_MOCK_INTERVAL_MS` | Mock snapshot interval in milliseconds                                                                                                                 | `5000`                                           |
| `SIMULATOR_DEVICE_ID`          | Future simulator device identity                                                                                                                       | `AGRONOVA-SIM-01`                                |

The WhatsApp bot has its own variables (`WA_*`, `AGRONOVA_API_*`; answers come from an open-source
model such as `qwen3:4b` served by Ollama through `WA_LLM_BASE_URL`), documented in
`apps/whatsapp-bot/.env.example` and [`apps/whatsapp-bot/README.md`](apps/whatsapp-bot/README.md). It
is not started by `corepack pnpm dev`; run `corepack pnpm --filter @agronova/whatsapp-bot dev`.

The web dashboard does not receive `DEVICE_OFFLINE_AFTER_MS` from the API. It assumes the API default
(30000 ms, `DEVICE_OFFLINE_AFTER_MS` in `apps/web/lib/telemetry/freshness.ts`) to mark data as stale,
so change both together.

See [the architecture document](docs/architecture.md) for boundaries and data-flow decisions, and
[the phased roadmap](docs/development-phases.md) before extending the system.

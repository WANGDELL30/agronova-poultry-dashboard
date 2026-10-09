# AgroNova Poultry AI IoT

Monitoring dashboard for laying-hen farms. The repository is a strict TypeScript monorepo with a
responsive bilingual Next.js dashboard, a NestJS/Fastify API, a telemetry simulator placeholder,
shared Zod schemas, a Python inference service for **chicken stress detection from images**, the
notebooks used to train and evaluate the model, and local TimescaleDB plus MQTT infrastructure.

## Current scope

| Area                        | Status                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| Overview dashboard          | Complete, runs on deterministic mock telemetry                                   |
| Vision (stress detection)   | Working end to end: upload frame → quality gate → VLM → SCS rule → temporal vote |
| MQTT ingestion, persistence | **Not implemented.** Simulator does not publish; no sensor data is stored        |
| Vision result persistence   | **In-memory only.** Results are lost when the API restarts                       |
| Real ESP32 devices, alerts  | Not implemented (placeholders only)                                              |
| Notifications, CSV exports  | Not implemented                                                                  |

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
4. **Temporal vote.** Window of 5 frames, minimum confidence 0.6; an alert is raised when `stress`
   is the majority with at least 3 votes.

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
  api/                      NestJS API (Fastify): health + vision endpoints
  inference/                FastAPI service: quality gate, Qwen3-VL + LoRA, SCS rule (Python)
  simulator/                Non-publishing telemetry simulator placeholder
  web/                      Next.js App Router frontend
packages/
  telemetry-schema/         Versioned telemetry types, validation, example, and tests
  mortality-model/          Shared server LSTM runtime, weights, and numerical verification
  vision-schema/            Vision result/vote contract (Zod) shared by API, web, and inference
training/                   Notebooks: labeling tool, training/evaluation, HF inference reference
infrastructure/
  mosquitto/config/         Local MQTT broker configuration
docs/
  architecture.md           Components, boundaries, and intended data flow
  development-phases.md     Phased delivery roadmap
  frontend-design.md        Frontend components, states, and responsive behavior
docker-compose.yml          TimescaleDB, Mosquitto, and optional inference (profiles)
```

## Prerequisites

- Node.js 22 or later and Corepack (included with Node.js)
- Docker Desktop or Docker Engine with Compose v2 for local infrastructure
- Python 3.11+ for `apps/inference`
- Real model only: an NVIDIA GPU with about 8–9 GB VRAM, or a free Colab/Kaggle GPU (see below)

The repository pins pnpm through the `packageManager` field and lockfile:

```bash
corepack pnpm install --frozen-lockfile
```

## Environment setup

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/simulator/.env.example apps/simulator/.env
```

Bash:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/simulator/.env.example apps/simulator/.env
```

Replace the example database password with the same local-only value in the root `.env` and in
`DATABASE_URL` of `apps/api/.env`. No environment file containing credentials, API keys, or tokens
should be committed.

## Run locally

### 1. Frontend only (mock data, no backend)

```bash
corepack pnpm --filter @agronova/telemetry-schema build
corepack pnpm --filter @agronova/vision-schema build
corepack pnpm --filter @agronova/web dev
```

With `NEXT_PUBLIC_DATA_MODE=mock` (the default in `apps/web/.env.example`), `/overview` and
`/vision` both use deterministic mock data. Open `http://localhost:3000`.

### 2. Full stack with the mock inference service (no GPU)

```bash
corepack pnpm infra:up
corepack pnpm inference:mock          # separate terminal; needs: pip install -r apps/inference/requirements-dev.txt
corepack pnpm dev
```

Set `NEXT_PUBLIC_DATA_MODE=api` in `apps/web/.env.local` and restart the web server.
The mock backend is deterministic and **does not classify real images**; it only exercises the
pipeline.

> In `api` mode the telemetry overview shows its "unavailable" state, because backend telemetry
> belongs to a later phase. Only `/vision` uses the real API.

### 3. Real model

Real inference on a CPU takes tens of minutes per image. Use one of:

- **Local NVIDIA GPU (Docker):**

  ```bash
  # set INFERENCE_API_KEY (and HF_TOKEN only if the adapter repo is private) in .env
  docker compose --profile gpu up -d --build inference-gpu
  ```

  `GET /health` returns `503` until the model is fully loaded (several minutes on first run).

- **Free GPU on Colab (demo only):** open `apps/inference/colab/run_inference_colab.ipynb`, set the
  runtime to T4 GPU, run all cells, then copy the printed `INFERENCE_URL` and `INFERENCE_API_KEY`
  into `apps/api/.env` and restart the API. The tunnel URL changes on every run.

See [`apps/inference/README.md`](apps/inference/README.md) for the parity check against the
training notebook.

### Service addresses

| Service    | URL / address                         | Configuration                     |
| ---------- | ------------------------------------- | --------------------------------- |
| Web        | `http://localhost:3000`               | `PORT` in `apps/web/.env.local`   |
| API        | `http://localhost:4000`               | `API_HOST`, `API_PORT`            |
| Health     | `http://localhost:4000/api/v1/health` | API environment                   |
| Inference  | `http://localhost:8000`               | `INFERENCE_PORT`, `INFERENCE_URL` |
| PostgreSQL | `localhost:5432`                      | `POSTGRES_PORT`, `DATABASE_URL`   |
| MQTT       | `mqtt://localhost:1883`               | `MQTT_PORT`, `MQTT_BROKER_URL`    |

Stop local infrastructure without deleting its named volumes:

```bash
corepack pnpm infra:down
```

## API endpoints (prefix `/api/v1`)

| Method | Path                        | Purpose                                                              |
| ------ | --------------------------- | -------------------------------------------------------------------- |
| GET    | `/health`                   | API and database status (`degraded` when PostgreSQL is unavailable)  |
| POST   | `/vision/frames`            | Multipart upload: one `image` (JPEG/PNG/WebP, up to 8 MB) + metadata |
| GET    | `/vision/results`           | Recent results, newest first (`camera_id`, `limit` 1–100)            |
| GET    | `/vision/results/:id/image` | Stored frame for a result                                            |
| GET    | `/vision/health`            | Vision pipeline status                                               |

Inference service: `GET /health` and `POST /v1/classify` (multipart `file`, optional `X-API-Key`).

## Frontend routes

| Route          | State                                              |
| -------------- | -------------------------------------------------- |
| `/overview`    | Complete responsive overview dashboard             |
| `/mortality`   | Non-gas readiness; operational prediction disabled |
| `/vision`      | Image upload, classification, history              |
| `/live`        | Future-module placeholder                          |
| `/history`     | Future-module placeholder                          |
| `/alerts`      | Future-module placeholder                          |
| `/devices`     | Future-module placeholder                          |
| `/calibration` | Future-module placeholder                          |
| `/exports`     | Future-module placeholder                          |
| `/settings`    | Future-module placeholder                          |

Frontend mock scenarios (`NEXT_PUBLIC_MOCK_SCENARIO`): `normal`, `warning`, `sensor-not-installed`,
`device-offline`. The frontend never connects directly to MQTT or to the inference service.

## Training and evaluation

The `training/` folder holds the notebooks behind the model. Suggested order:

1. `scs_labeling_tool_colab_multichicken.ipynb`: label chickens against the 7 SCS indicators.
2. `chickenstress-kaggle.ipynb`: data balancing, LoRA fine-tuning of
   Qwen3-VL-4B, evaluation, and push of the adapter to Hugging Face.
3. `inference-vlm-lora-huggingface.ipynb`: reference inference pipeline loaded from Hugging Face.
   `apps/inference` is a port of it, and `apps/inference/scripts/parity_check.py` verifies that both
   produce identical results.

The dataset (Roboflow "Stressed chicken" v19, COCO format), model weights, and run artifacts are
not stored in this repository.

### Deploy the frontend to Vercel

Use the existing Vercel project for `apps/web`; NestJS, the simulator, PostgreSQL, and MQTT services
are not part of this deployment. The mortality server endpoints run as Next.js Route Handlers on
Vercel. The web package builds the shared telemetry schema, vision schema, and mortality runtime before Next.js.

Use these public frontend settings in Vercel when an explicit deployment configuration is needed:

```env
NEXT_PUBLIC_DATA_MODE=mock
NEXT_PUBLIC_MOCK_SCENARIO=normal
NEXT_PUBLIC_MOCK_INTERVAL_MS=5000
```

The same values are already the application defaults, so no secret variables are required for the
F1 mock dashboard. Run a direct production deployment from the repository root with:

```bash
corepack pnpm dlx vercel@latest deploy --prod
```

## Checks and builds

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm build
corepack pnpm inference:test        # Python tests (pytest), needs requirements-dev.txt
docker compose config
```

Run an individual workspace when needed:

```bash
corepack pnpm --filter @agronova/api dev
corepack pnpm --filter @agronova/web dev
corepack pnpm --filter @agronova/vision-schema test
corepack pnpm --filter @agronova/telemetry-schema test
```

The simulator prints an idle startup message and exits successfully. It deliberately does not
connect to MQTT or publish telemetry.

## Environment variable reference

| Variable                       | Purpose                                               | Default / requirement               |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------- |
| `POSTGRES_DB`                  | Compose database name                                 | `agronova`                          |
| `POSTGRES_USER`                | Compose database user                                 | `agronova`                          |
| `POSTGRES_PASSWORD`            | Compose database password                             | Required; local secret              |
| `POSTGRES_PORT`                | Host PostgreSQL port                                  | `5432`                              |
| `MQTT_PORT`                    | Host MQTT port                                        | `1883`                              |
| `INFERENCE_PORT`               | Host port of the inference container                  | `8000`                              |
| `API_HOST`                     | API bind address                                      | `0.0.0.0`                           |
| `API_PORT`                     | API port                                              | `4000`                              |
| `APP_VERSION`                  | Version reported by health                            | `0.1.0`                             |
| `WEB_ORIGIN`                   | Comma-separated allowed browser origins               | `http://localhost:3000`             |
| `DATABASE_URL`                 | PostgreSQL connection string used by API health       | Omit to report `not_configured`     |
| `DATABASE_CONNECT_TIMEOUT_MS`  | Health-query connection timeout                       | `3000`                              |
| `INFERENCE_URL`                | Inference service base URL used by the API            | `http://localhost:8000`             |
| `INFERENCE_API_KEY`            | Shared secret (`X-API-Key`) for the inference service | Empty = no auth; set for tunnels    |
| `INFERENCE_TIMEOUT_MS`         | API timeout for one inference call                    | `30000` (`120000` recommended real) |
| `VISION_IMAGE_DIR`             | Where uploaded frames are stored                      | `./data/vision-images`              |
| `VISION_MAX_IMAGE_BYTES`       | Maximum upload size                                   | `8388608`                           |
| `INFERENCE_MODE`               | Inference backend: `mock` or `real`                   | `mock`                              |
| `HF_ADAPTER_REPO`              | LoRA adapter repository (real mode)                   | `Arga23/chickenstress-vlm-lora`     |
| `HF_BASE_MODEL`                | Base VLM (real mode)                                  | `Qwen/Qwen3-VL-4B-Instruct`         |
| `HF_TOKEN`                     | Hugging Face token, only if the adapter is private    | Never commit                        |
| `PORT`                         | Next.js web port                                      | `3000`                              |
| `NEXT_PUBLIC_API_BASE_URL`     | Browser-visible API base URL                          | `http://localhost:4000`             |
| `NEXT_PUBLIC_DATA_MODE`        | Frontend data source: `mock` or `api`                 | `mock`                              |
| `NEXT_PUBLIC_MOCK_SCENARIO`    | Deterministic frontend simulation scenario            | `normal`                            |
| `NEXT_PUBLIC_MOCK_INTERVAL_MS` | Mock snapshot interval in milliseconds                | `5000`                              |
| `MQTT_BROKER_URL`              | Future simulator broker URL                           | `mqtt://localhost:1883`             |
| `MQTT_TELEMETRY_TOPIC`         | Future shared simulator/device topic template         | example file value                  |
| `SIMULATOR_DEVICE_ID`          | Future simulator device identity                      | `AGRONOVA-SIM-01`                   |

See [the architecture document](docs/architecture.md) for boundaries and data-flow decisions, and
[the phased roadmap](docs/development-phases.md) before extending the system.

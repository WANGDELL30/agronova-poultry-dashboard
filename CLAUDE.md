# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AgroNova Poultry AI IoT: a pnpm TypeScript monorepo (Next.js web, NestJS/Fastify API, telemetry simulator placeholder, shared Zod schema packages) plus a separate Python FastAPI inference service for **chicken stress detection from images** (Qwen3-VL-4B-Instruct + LoRA adapter). The overview dashboard and the seven operations modules (live API telemetry via HTTP ingest, later-phase controls disabled), snapshot JSON/CSV export, and the vision pipeline are implemented; persistence and alert notifications are not. Devices send telemetry over HTTP (`POST /api/v1/telemetry`, per-device `X-Device-Key` when `TELEMETRY_DEVICE_KEYS` is set) through a Cloudflare Tunnel; MQTT is not used (decision 2026-11-20). `AGENTS.md` holds the permanent project rules and `README.md` the full env var table and run modes. Read `AGENTS.md` before changing anything, especially the vision and sensor-semantics sections.

Note: the parent folder holds earlier notebook runs and docs, not code to maintain. This directory is the repo (its own `.git`). Example env files live in the app folders (`apps/*/.env.example`, including `apps/inference/.env.example`); there is no root env file. Docker is not used (decision 2026-11-20): every service runs directly.

## Commands

Always run pnpm through Corepack (`corepack pnpm ...`); Node >= 22.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck        # builds telemetry-schema + vision-schema first, then typechecks all
corepack pnpm lint             # eslint .
corepack pnpm format:check     # prettier (use `format` to write)
corepack pnpm test             # vitest in every workspace
corepack pnpm build
corepack pnpm inference:test   # pytest in apps/inference (needs requirements-dev.txt)

corepack pnpm dev              # builds schemas, then runs api + web + simulator in parallel
corepack pnpm inference:mock   # FastAPI on :8000, mock backend, no GPU
```

Single tests:

```bash
corepack pnpm --filter @agronova/api exec vitest run src/vision/voter.spec.ts
corepack pnpm --filter @agronova/api exec vitest run -t "test name"
cd apps/inference && python -m pytest tests/test_scs.py -k name
```

Frontend-only dev: build both schema packages and `@agronova/mortality-model` (the web app imports it), then `corepack pnpm --filter @agronova/web dev` with `NEXT_PUBLIC_DATA_MODE=mock`. Use `NEXT_PUBLIC_DATA_MODE=api` (with `NEXT_PUBLIC_API_BASE_URL`) for `/vision` and the telemetry pages against the real API. The overview then polls `/api/v1/telemetry/latest` and shows a waiting state until the API holds a reading. The schema packages must be rebuilt (`build`) after edits before dependents see the changes.

## Architecture

Vision flow: `web /vision` → multipart `POST /api/v1/vision/frames` on the API → `POST /v1/classify` on the inference service → quality gate → VLM answers `YA`/`TIDAK`/`TIDAK_TERLIHAT` for 7 SCS indicators → SCS rule → API applies a temporal vote over the last 5 accepted frames per camera.

- `packages/vision-schema` (Zod) is the single contract between API, web, and inference. The Python response in `apps/inference/app` must be kept in sync with it manually.
- `apps/inference/app`: `quality.py` (blur/brightness/blank gate with one enhancement pass), `backends.py` (`mock` vs `real` model backend, selected by `INFERENCE_MODE`; `HF_ADAPTER_REPO` may be a local folder; the LoRA is never merged, there is no `MERGE_ADAPTER`), `scs.py` (rule), `pipeline.py` (orchestration), `config.py`. `/health` returns 503 until the real model finishes loading.
- `apps/api/src/vision`: controller → service → `inference-client.ts`; `voter.ts` re-exports the voting window from `packages/vision-schema/src/voter.ts` (shared with the web mock client); `vision.repository.ts` is an interface with an **in-memory** implementation (results lost on restart; Postgres is intentionally deferred and requires migrations). Uploaded frames go to `apps/api/data/` (never commit).
- `apps/web`: Next.js App Router; `components/vision` and `lib/vision` have a mock/api client switch driven by `NEXT_PUBLIC_DATA_MODE`. The browser never talks to MQTT or the inference service directly.
- `apps/whatsapp-bot`: separate Fastify process (port 4100, not part of `corepack pnpm dev`) for WhatsApp warnings and LLM Q&A (open-source model, default `qwen3:4b`, via any OpenAI-compatible server such as Ollama; it shares the GPU with the VLM, so keep it small). It only issues `GET` requests to the API and keeps all state in memory. `src/agronova/snapshot.ts` turns API data into text that already follows the sensor and vision rules; device control is detected in `src/chat/control.ts` and always answered "not available" (`WA_CONTROL_ENABLED` accepts only `false`). `WA_PROVIDER=console` runs it without a Meta account.
- `apps/simulator`: telemetry placeholder that deliberately exits without publishing (`src/index.ts` only). There is no vision frame feeder; post frames with `curl` or the `/vision` page.
- `training/`: notebooks (labeling tool, Kaggle training/eval, HF reference inference). `apps/inference` is a port of the reference inference notebook; `apps/inference/scripts/parity_check.py` and `tests/test_parity.py` verify they match. Datasets and weights are not stored here.

Real inference needs an NVIDIA GPU (~8-9 GB): uvicorn with `requirements-real.txt` and `--env-file .env` (systemd on the always-on pilot server, see `apps/inference/README.md`), or Colab (`apps/inference/colab/run_inference_colab.ipynb`) for demos. `INFERENCE_EXIT_ON_LOAD_ERROR` defaults to `false` because nothing restarts the process unless a supervisor is set up. PostgreSQL is optional (health check only); leave `DATABASE_URL` unset without it.

## Constraints that need cross-file edits

- SCS constants (stress at >= 3 `YA`, `undefined` if fewer than 5 of 7 visible) mirror the training notebook and inference notebook 04. Voting constants (window 5, alert at >= 3 stress votes) come from the voter in inference notebook 04 only, and since K1 (decision 2026-11-13) the voter deliberately deviates from it: no confidence filter (`VOTE_CONFIDENCE_THRESHOLD` is deprecated). Change them only together in `packages/vision-schema` and `apps/inference/app/scs.py`, after re-evaluating the model.
- `skipped_quality`, `parse_error`, `inference_error`, and `undefined` are never `not_stress`; frames with no classification have `result: null`.
- Every vision record has `source`: `camera` (valid `X-Camera-Key`, or any upload while `VISION_CAMERA_KEYS` is unset) or `manual` (keyless while keys are set). Manual frames get vote `ignored_manual`, never enter a window, and never alert; keep this in the schema (`packages/vision-schema`), the API, and the web badge.
- Telemetry: UTC timestamps, keep both `captured_at` and `received_at`, null is not zero, and MQ-5 is never shown as ppm.

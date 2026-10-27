# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AgroNova Poultry AI IoT: a pnpm TypeScript monorepo (Next.js web, NestJS/Fastify API, telemetry simulator placeholder, shared Zod schema packages) plus a separate Python FastAPI inference service for **chicken stress detection from images** (Qwen3-VL-4B-Instruct + LoRA adapter). Only the overview dashboard (mock telemetry) and the vision pipeline are implemented; MQTT ingestion, persistence, and alerts are not. `AGENTS.md` holds the permanent project rules and `README.md` the full env var table and run modes. Read `AGENTS.md` before changing anything, especially the vision and sensor-semantics sections.

Note: the parent folder holds earlier notebook runs and docs, not code to maintain. This directory is the repo (its own `.git`). The example env files are named `env.example` / `gitignore` in the working tree, while the README refers to `.env.example` / `.gitignore`.

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
docker compose config

corepack pnpm dev              # builds schemas, then runs api + web + simulator in parallel
corepack pnpm infra:up         # TimescaleDB + Mosquitto
corepack pnpm inference:mock   # FastAPI on :8000, mock backend, no GPU
```

Single tests:

```bash
corepack pnpm --filter @agronova/api exec vitest run src/vision/voter.spec.ts
corepack pnpm --filter @agronova/api exec vitest run -t "test name"
cd apps/inference && python -m pytest tests/test_scs.py -k name
```

Frontend-only dev: build both schema packages, then `corepack pnpm --filter @agronova/web dev` with `NEXT_PUBLIC_DATA_MODE=mock`. Use `NEXT_PUBLIC_DATA_MODE=api` for `/vision` against the real API (the telemetry overview then shows "unavailable" by design). The schema packages must be rebuilt (`build`) after edits before dependents see the changes.

## Architecture

Vision flow: `web /vision` → multipart `POST /api/v1/vision/frames` on the API → `POST /v1/classify` on the inference service → quality gate → VLM answers `YA`/`TIDAK`/`TIDAK_TERLIHAT` for 7 SCS indicators → SCS rule → API applies a temporal vote over the last 5 accepted frames per camera.

- `packages/vision-schema` (Zod) is the single contract between API, web, and inference. The Python response in `apps/inference/app` must be kept in sync with it manually.
- `apps/inference/app`: `quality.py` (blur/brightness/blank gate with one enhancement pass), `backends.py` (`mock` vs `real` model backend, selected by `INFERENCE_MODE`; `HF_ADAPTER_REPO` may be a local folder, `MERGE_ADAPTER=1` merges LoRA), `scs.py` (rule), `pipeline.py` (orchestration), `config.py`. `/health` returns 503 until the real model finishes loading.
- `apps/api/src/vision`: controller → service → `inference-client.ts`; `voter.ts` implements the voting window; `vision.repository.ts` is an interface with an **in-memory** implementation (results lost on restart; Postgres is intentionally deferred and requires migrations). Uploaded frames go to `apps/api/data/` (never commit).
- `apps/web`: Next.js App Router; `components/vision` and `lib/vision` have a mock/api client switch driven by `NEXT_PUBLIC_DATA_MODE`. The browser never talks to MQTT or the inference service directly.
- `apps/simulator`: telemetry placeholder that deliberately exits without publishing; `src/vision-feeder.ts` (`feed:vision`) posts frames from a folder or camera snapshot URL to the API on an interval.
- `training/`: notebooks (labeling tool, Kaggle training/eval, HF reference inference). `apps/inference` is a port of the reference inference notebook; `apps/inference/scripts/parity_check.py` and `tests/test_parity.py` verify they match. Datasets and weights are not stored here.

Real inference needs an NVIDIA GPU (~8-9 GB) via `docker compose --profile gpu up inference-gpu`, or Colab (`apps/inference/colab/run_inference_colab.ipynb`). `--profile mock` runs the CPU mock container.

## Constraints that need cross-file edits

- SCS constants (stress at >= 3 `YA`, `undefined` if fewer than 5 of 7 visible) and voting constants (window 5, confidence >= 0.6, alert at >= 3 stress votes) mirror the training notebook. Change them only together in `packages/vision-schema` and `apps/inference/app/scs.py`, after re-evaluating the model.
- `skipped_quality`, `parse_error`, `inference_error`, and `undefined` are never `not_stress`; frames with no classification have `result: null`.
- Telemetry: UTC timestamps, keep both `captured_at` and `received_at`, null is not zero, and MQ-5 is never shown as ppm.

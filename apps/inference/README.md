# AgroNova inference service

FastAPI service for chicken stress detection (quality gate → Qwen3-VL-4B + LoRA → SCS rule).
Logic in `app/scs.py` and the first half of `app/quality.py` is copied unchanged from the notebook.

```bash
pip install -r requirements-dev.txt
INFERENCE_MODE=mock python -m uvicorn app.main:app --port 8000   # no GPU
python -m pytest
```

Real mode (GPU, ~8-9 GB VRAM): `pip install -r requirements-real.txt`, set `INFERENCE_MODE=real`
(`HF_TOKEN` is optional because the default adapter `Arga23/chickenstress-vlm-lora` is public; set it
only for a private adapter repo, and never commit it), or use `docker compose --profile gpu up inference-gpu`.
`GET /health` returns 503 until the model is loaded, with `loading_since` (UTC) while loading. A load
that raises anything (including `SystemExit`) or exceeds `INFERENCE_LOAD_TIMEOUT_S` (default 1800 s)
becomes `error`; in real mode the process then exits non-zero so the orchestrator restarts it
(`INFERENCE_EXIT_ON_LOAD_ERROR`, default `true` in real mode, `false` in mock). While not ready,
`POST /v1/classify` answers 503 `{"error": "model_not_ready", "status": "loading" | "error"}`; a backend
crash answers 503 `{"error": "gpu_oom"}` or 500 `{"error": "backend_error"}`. `POST /v1/classify`
takes a multipart `file`.

## Real model without a local GPU (Kaggle / Colab)

Real mode on a laptop CPU is very slow (tens of minutes per image). The real model needs a GPU (~8-9 GB VRAM), e.g. a Kaggle T4/P100.
Zip this folder (`apps/inference`) as a Kaggle Dataset. `HF_TOKEN` is optional (the default adapter is public); for a private adapter
repo, add a read token as a Kaggle Secret.

**A. Parity check** (proves the service matches the notebook):

1. In notebook 04, run the cells up to the voter, then paste and run `scripts/notebook_reference_cell.py`
   as a new cell. It writes `/kaggle/working/notebook_reference.json`.
2. Restart the kernel (frees VRAM). In a new cell, with the dataset mounted:
   `!pip install -q -r requirements.txt -r requirements-real.txt`, set `HF_TOKEN` from Kaggle Secrets into
   `os.environ` (only for a private adapter repo), then `!python scripts/parity_check.py --reference /kaggle/working/notebook_reference.json`.
3. Expect `N/N identical`. Send back `parity_report.json` if anything differs.

**Deliberate deviations from notebook 04** (a parity check must not count these as divergence):

- **Truncated files (AUDIT R9).** A JPEG, PNG, or WebP cut off mid-file is `skipped_quality` with the
  issue `gambar_rusak`, detected before decoding. The notebook decodes it anyway; `cv2.imdecode`
  fills the missing part with uninitialised memory, so the result changed on every call.
- **Image size limits (AUDIT R2, decision 2026-11-13).** Before decoding, the pixel count is read
  from the file header; above `INFERENCE_MAX_IMAGE_PIXELS` (default 40 MP) the service answers 413
  `{"error": "image_too_large"}`, and `OPENCV_IO_MAX_IMAGE_PIXELS` is set to the same value as a second
  safeguard. A frame whose longer side exceeds `INFERENCE_MAX_IMAGE_SIDE` (default 1280 px) is
  downscaled with `INTER_AREA` before the quality gate. The notebook works at full resolution; frames
  up to 1280 px (including the 640 px dataset) are not changed, so parity on the dataset holds.

**B. Demo with the dashboard (free GPU on Colab):**

1. Open `colab/run_inference_colab.ipynb` in Google Colab and set the runtime to **T4 GPU**.
2. **Run all.** The first run takes ~5-10 minutes (model download).
3. Copy the printed `INFERENCE_URL` and `INFERENCE_API_KEY` into `apps/api/.env`
   (plus `INFERENCE_TIMEOUT_MS=120000`) and restart the API.

The tunnel URL changes every run and free Colab sessions end when idle, so this is for demos,
not production.

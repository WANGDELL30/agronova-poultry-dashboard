# AgroNova inference service

FastAPI service for chicken stress detection (quality gate → Qwen3-VL-4B + LoRA → SCS rule).
Logic in `app/scs.py` and the first half of `app/quality.py` is copied unchanged from the notebook.

```bash
pip install -r requirements-dev.txt
INFERENCE_MODE=mock python -m uvicorn app.main:app --port 8000   # no GPU
python -m pytest
```

Real mode (GPU, ~8-9 GB VRAM): `pip install -r requirements-real.txt`, set `INFERENCE_MODE=real` and
`HF_TOKEN` (read-only, never commit), or use `docker compose --profile gpu up inference-gpu`.
`GET /health` returns 503 until the model is loaded. `POST /v1/classify` takes a multipart `file`.

## Real model without a local GPU (Kaggle)

Only mock mode runs on a laptop. The real model needs a GPU (~8-9 GB VRAM), e.g. a Kaggle T4/P100.
Add `HF_TOKEN` (read) as a Kaggle Secret and zip this folder (`apps/inference`) as a Kaggle Dataset.

**A. Parity check** (proves the service matches the notebook):

1. In notebook 04, run the cells up to the voter, then paste and run `scripts/notebook_reference_cell.py`
   as a new cell. It writes `/kaggle/working/notebook_reference.json`.
2. Restart the kernel (frees VRAM). In a new cell, with the dataset mounted:
   `!pip install -q -r requirements.txt -r requirements-real.txt`, set `HF_TOKEN` from Kaggle Secrets into
   `os.environ`, then `!python scripts/parity_check.py --reference /kaggle/working/notebook_reference.json`.
3. Expect `N/N identical`. Send back `parity_report.json` if anything differs.

**B. Demo with the dashboard on your laptop:** run the service in Kaggle
(`INFERENCE_MODE=real INFERENCE_API_KEY=<random> python -m uvicorn app.main:app --port 8000`), expose it
with a tunnel (e.g. `cloudflared tunnel --url http://localhost:8000`), then in your local `.env` set
`INFERENCE_URL=<tunnel url>` and the same `INFERENCE_API_KEY`. Always set the API key when tunneling.
The tunnel URL changes every run, and sessions end (Kaggle time/GPU quotas), so this is for demos, not
production.

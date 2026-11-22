# AgroNova inference service

FastAPI service for chicken stress detection (quality gate → Qwen3-VL-4B + LoRA → SCS rule).
Logic in `app/scs.py` and the first half of `app/quality.py` is copied unchanged from the notebook.

```bash
pip install -r requirements-dev.txt
INFERENCE_MODE=mock python -m uvicorn app.main:app --port 8000   # no GPU
python -m pytest
```

There is no Docker image (decision 2026-11-20): the service runs with uvicorn directly, on Colab for
demos or on an always-on GPU server for the pilot (see below). Settings come from the environment;
copy `.env.example` to `.env` and pass `--env-file .env` to uvicorn.

Real mode (GPU, ~8-9 GB VRAM): `pip install -r requirements-real.txt`, set `INFERENCE_MODE=real`
(`HF_TOKEN` is optional because the default adapter `Arga23/chickenstress-vlm-lora` is public; set it
only for a private adapter repo, and never commit it). Real mode also requires `INFERENCE_API_KEY`
(the service refuses to start without it, AUDIT S4); use the same value as in `apps/api/.env`. A
failed load is reported on `/health` as a generic message, and a `parse_error` frame carries a fixed
`error_message`; the underlying exception text is written to the service log only (AUDIT S12).
`GET /health` returns 503 until the model is loaded, with `loading_since` (UTC) while loading. A load
that raises anything (including `SystemExit`) or exceeds `INFERENCE_LOAD_TIMEOUT_S` (default 1800 s)
becomes `error`, and the service stays up reporting it. With `INFERENCE_EXIT_ON_LOAD_ERROR=true` the
process exits non-zero instead, which is only useful under a supervisor that restarts it (systemd,
below); the default is `false` in every mode. While not ready,
`POST /v1/classify` answers 503 `{"error": "model_not_ready", "status": "loading" | "error"}`; a backend
crash answers 503 `{"error": "gpu_oom"}` or 500 `{"error": "backend_error"}`. `POST /v1/classify`
takes a multipart `file`. At most one request runs the model; `INFERENCE_MAX_QUEUE` (default 2) more may
wait, and any further request gets 503 `{"error": "queue_full"}` with `Retry-After` at once (AUDIT R1). A
request whose client has already disconnected is dropped right before the model runs.

Measured on a Colab T4 (fp16, GPU parity run 2026-11-14, 68 images): peak VRAM 8.7 GB, model load
about 38 s (plus about 112 s to download base and adapter the first time), generation p50 9.8 s /
p95 11.2 s per image, and identical raw output on 5 of 5 repeated images. Other GPUs need their own
measurement.

Using the service in-process (importing `app` in a Colab or Jupyter kernel instead of running
uvicorn in a separate process) must keep `INFERENCE_EXIT_ON_LOAD_ERROR` at its default `false`: the
exit on a load error (AUDIT H11) would otherwise kill the kernel.

## Always-on GPU server (pilot)

For the pilot the repository is cloned onto a private GPU server that stays on. Use Linux with an
NVIDIA GPU of about 9 GB VRAM or more and a driver that supports the CUDA build of the pinned `torch`
in `requirements-real.txt` (check with `nvidia-smi`). The parity run (2026-11-14) used exactly these
pins on Linux, so this is the closest match to the verified setup.

```bash
cd apps/inference
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-real.txt
cp .env.example .env    # INFERENCE_MODE=real, INFERENCE_API_KEY=<secret shared with the API>
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file .env
```

Before the pilot relies on it, on that server:

1. Run the parity check (section A below) with the same reference and images; expect `N/N identical`.
   Another GPU or driver can change the output.
2. Measure inference time and set `INFERENCE_TIMEOUT_MS` in the API from it; the 60 s default was
   measured on a T4 only (PV9).
3. Keep `--host 127.0.0.1` when the API runs on the same server. If the API runs elsewhere, expose
   inference only through its own tunnel or a private network, always with `INFERENCE_API_KEY`.

Run it under systemd so it starts at boot and restarts after a crash. Only with a supervisor like this
is `INFERENCE_EXIT_ON_LOAD_ERROR=true` useful: a failed model load then exits and is retried.

```ini
# /etc/systemd/system/agronova-inference.service
[Unit]
Description=AgroNova inference (Qwen3-VL + LoRA)
After=network-online.target
Wants=network-online.target

[Service]
User=agronova
WorkingDirectory=/opt/agronova-poultry-dashboard/apps/inference
Environment=INFERENCE_EXIT_ON_LOAD_ERROR=true
ExecStart=/opt/agronova-poultry-dashboard/apps/inference/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file .env
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

`sudo systemctl daemon-reload && sudo systemctl enable --now agronova-inference`, then follow the log
with `journalctl -u agronova-inference -f`. Run it as an unprivileged user, never as root. The model
cache lives in that user's `~/.cache/huggingface`.

## Detector evaluation for P2 (crop before the VLM)

`colab/p2_detector_eval_colab.ipynb` is step 1 of AUDIT P2: before any service code, it compares
detectors (YOLO11 COCO `bird`, and the custom ChickenStress detector if its `best.pt` is uploaded) on
the 51 labelled frames (69 chickens), then runs the service VLM on the full frame, on the annotated
crop, and on the best detector's crop. Crops follow the training rule exactly: `int()` of the box and a
plain PIL crop with no padding (`scripts/p2_eval.py`; `tests/test_p2_eval.py` shows it reproduces the
committed training crops pixel for pixel, except frames the training notebook sharpened first). It
needs the raw Roboflow export (`Raw Data Chicken Stress.zip`, not in git) and a T4. 65 of the 69
chickens are from the training split, so compare the inputs with each other rather than reading the
accuracy as performance on new data. Ultralytics is AGPL-3.0.

**Result (T4, 2026-11-22; `results/vlm/p2_2026-11-22/`): the service keeps the full frame, and P2 is
postponed (AUDIT decision 2026-11-22).** On the same 51 frames, scored on the 42 chickens labelled
`stress` or `not_stress`:

| Input                      | Correct                        | Stress missed | False stress |
| -------------------------- | ------------------------------ | ------------- | ------------ |
| Full frame (current)       | 36/42                          | 6             | 0            |
| Annotated crop (best case) | 31/42                          | 11            | 0            |
| Detector crop              | 25/38, plus 5 frames not found | 12            | 0            |

Paired per frame, the full frame was right where the crop was wrong 7 times, and the reverse 2 times.
The 12 multi-chicken frames showed no gain either (6/9 full, 5/9 crop). The crops that failed were
small (median about 56k pixels, against about 152k where both inputs were right; every frame is
640x640). The best detector was YOLO11s COCO `bird` at confidence 0.1: its largest box hit a chicken in
78% of frames, it found nothing in 10%, and it took 13 ms per frame. YOLO11n reached 49%, and the
custom detector was not tested. The earlier PV3 figure (crop 16/17 against full frame 33/47) compared
different image sets, so this paired result replaces it. The dataset frames are mostly close-ups (the
largest chicken covers about 37% of the frame), while a barn camera may show many small chickens.
Rerun this notebook on about 50 labelled pilot frames before deciding on P2 again.

## Real model without a local GPU (Kaggle / Colab)

Real mode on a laptop CPU is very slow (tens of minutes per image). The real model needs a GPU (~8-9 GB VRAM), e.g. a Kaggle T4/P100.
Zip this folder (`apps/inference`) as a Kaggle Dataset. `HF_TOKEN` is optional (the default adapter is public); for a private adapter
repo, add a read token as a Kaggle Secret.

**A. Parity check** (proves the service matches the notebook):

1. In notebook 04, run the cells up to the voter, then paste and run `scripts/notebook_reference_cell.py`
   as a new cell. It writes `/kaggle/working/notebook_reference.json`. First set `PARITY_IMAGE_DIR` to a
   folder that covers every quality-gate path and includes single-chicken crops, with at least
   **5 `ok`, 3 `enhanced`, and 2 `skipped`** images (AUDIT P4). The default `DEST/test` has only 2
   `ok` images, so "2/2 identical" proves nothing for enhancement. A good example is the audit's Colab
   bundle (68 images, 5 of them `enhanced`, including the crop `stress_0001.jpg`); it is not stored in
   this repo. Both the cell and `parity_check.py` print a warning when a path is below its minimum.
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

**Known difference from the training data, not from notebook 04 (AUDIT P10).** The service
(`cv2.imdecode`) and notebook 04 (`cv2.imread`) decode identically: both rotate a JPEG according to
its EXIF Orientation tag and scale a 16-bit PNG down to 8 bits. The training notebook opens images
with PIL (`Image.open(...).convert("RGB")`), which does not apply EXIF orientation and clips 16-bit
values instead of scaling them. None of the 126 dataset images (frames and crops) has an EXIF
orientation other than 1, so the current data is not affected. A future phone or camera photo with an
EXIF rotation, or a 16-bit PNG, would reach the model differently from how the training data did; if
crops are prepared elsewhere, apply the same EXIF handling there.

**The service prompt deliberately differs from the training prompt (AUDIT P1, decision 2026-11-14).**
The system prompt in `app/scs.py` is the one from notebook 04, not the training prompt
(`_meta.system_prompt` in `results/vlm/vlm_experiments.json`). The metrics in `results/vlm` were
measured with the training prompt (the T4 run reproduced `predictions.csv` 8/8), so they are not the
accuracy of this service. Measured on a T4 with the service prompt (PV2/PV3, 2026-11-14): 16/17
labelled crops and 33/47 full frames correct. The training prompt scored 15/17 on the same crops; at
n = 17 the difference is not meaningful, so the service prompt stays. Both samples are small.

**B. Demo with the dashboard (free GPU on Colab):**

1. Open `colab/run_inference_colab.ipynb` in Google Colab and set the runtime to **T4 GPU**.
2. **Run all.** The first run takes ~5-10 minutes (model download).
3. Copy the printed `INFERENCE_URL` and `INFERENCE_API_KEY` into `apps/api/.env`
   (plus `INFERENCE_TIMEOUT_MS=60000`, the default measured on a T4) and restart the API.

The tunnel URL changes every run and free Colab sessions end when idle, so this is for demos,
not production.

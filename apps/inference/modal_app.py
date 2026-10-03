"""Deploy apps/inference ke Modal (GPU serverless).

Pakai:  cd apps/inference && modal deploy modal_app.py
Secret: modal secret create agronova-inference HF_TOKEN=hf_xxx INFERENCE_API_KEY=xxx
Opsional: MODAL_MIN_CONTAINERS=1 modal deploy modal_app.py   (selalu hangat, tanpa cold start, tapi bayar terus)
"""
import os
from pathlib import Path

import modal

HERE = Path(__file__).parent


def _reqs(name: str) -> list[str]:
    lines = (HERE / name).read_text().splitlines()
    return [l.strip() for l in lines if l.strip() and not l.startswith(("#", "-r"))]


hf_cache = modal.Volume.from_name("agronova-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libglib2.0-0", "libgl1")  # dependensi runtime OpenCV
    .pip_install(*_reqs("requirements.txt"), *_reqs("requirements-real.txt"))
    .env(
        {
            "INFERENCE_MODE": "real",
            "INFERENCE_LOAD_BLOCKING": "1",  # model dimuat penuh sebelum menerima request
            "HF_HOME": "/cache",  # bobot model di-cache di Volume -> tidak unduh ulang
            "PYTHONPATH": "/root",
        }
    )
    .add_local_dir(HERE / "app", "/root/app")  # harus paling akhir
)

app = modal.App("agronova-inference", image=image)


@app.function(
    gpu="T4",  # 16 GB, cukup untuk Qwen3-VL-4B fp16 (~8-9 GB)
    secrets=[modal.Secret.from_name("agronova-inference")],
    volumes={"/cache": hf_cache},
    scaledown_window=300,  # tetap hangat 5 menit setelah request terakhir
    min_containers=int(os.environ.get("MODAL_MIN_CONTAINERS", "0")),
    timeout=600,
)
@modal.asgi_app()
def serve():
    from app.main import app as fastapi_app

    return fastapi_app

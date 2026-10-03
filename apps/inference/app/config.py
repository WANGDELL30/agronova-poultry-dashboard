import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mode: str  # "mock" | "real"
    hf_adapter_repo: str
    base_model: str
    hf_token: str | None
    max_image_bytes: int
    api_key: str | None = None


def load_settings() -> Settings:
    mode = os.environ.get("INFERENCE_MODE", "mock").strip().lower()
    if mode not in ("mock", "real"):
        raise ValueError('INFERENCE_MODE must be "mock" or "real".')
    return Settings(
        mode=mode,
        hf_adapter_repo=os.environ.get("HF_ADAPTER_REPO", "Arga23/chickenstress-vlm-lora"),
        base_model=os.environ.get("HF_BASE_MODEL", "Qwen/Qwen3-VL-4B-Instruct"),
        hf_token=os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None,
        max_image_bytes=int(os.environ.get("VISION_MAX_IMAGE_BYTES", str(8 * 1024 * 1024))),
        api_key=os.environ.get("INFERENCE_API_KEY") or None,
    )

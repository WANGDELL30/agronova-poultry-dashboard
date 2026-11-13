import os
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mode: str  # "mock" | "real"
    hf_adapter_repo: str
    base_model: str
    hf_token: str | None
    max_image_bytes: int
    api_key: str | None = None


def _positive_int(name: str, default: int) -> int:
    """Decimal digits only and >= 1: the same rule as apps/api/src/vision/vision-config.ts (AUDIT H8)."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    if not re.fullmatch(r"[0-9]+", raw) or int(raw) < 1:
        raise ValueError(f'{name} must be a whole number >= 1 (digits only); received "{raw}".')
    return int(raw)


def load_settings() -> Settings:
    mode = os.environ.get("INFERENCE_MODE", "mock").strip().lower()
    if mode not in ("mock", "real"):
        raise ValueError('INFERENCE_MODE must be "mock" or "real".')
    return Settings(
        mode=mode,
        hf_adapter_repo=os.environ.get("HF_ADAPTER_REPO", "Arga23/chickenstress-vlm-lora"),
        base_model=os.environ.get("HF_BASE_MODEL", "Qwen/Qwen3-VL-4B-Instruct"),
        hf_token=os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None,
        max_image_bytes=_positive_int("VISION_MAX_IMAGE_BYTES", 8 * 1024 * 1024),
        api_key=os.environ.get("INFERENCE_API_KEY") or None,
    )

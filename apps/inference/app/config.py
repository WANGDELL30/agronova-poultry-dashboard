import os
import re
from dataclasses import dataclass


# Image size limits applied before the quality gate (AUDIT R2, decision 2026-11-13). Deliberate
# deviation from notebook 04, which works at full resolution; dataset frames (640 px) are unaffected.
DEFAULT_MAX_IMAGE_PIXELS = 40_000_000  # INFERENCE_MAX_IMAGE_PIXELS: larger -> 413 without decoding
DEFAULT_MAX_IMAGE_SIDE = 1280  # INFERENCE_MAX_IMAGE_SIDE: longer side is downscaled to this (INTER_AREA)

# Model revisions that passed the GPU parity check on a T4 (PV1, 2026-11-14; AUDIT S10/P7). Hub ids are
# loaded at these commits; for a local folder they are only reported, because a folder has no revision.
DEFAULT_BASE_REVISION = "ebb281ec70b05090aa6165b016eac8ec08e71b17"  # INFERENCE_BASE_REVISION
DEFAULT_ADAPTER_REVISION = "51b653173b0ef8945508bd10f2ebdcaebfd3e441"  # INFERENCE_ADAPTER_REVISION


@dataclass(frozen=True)
class Settings:
    mode: str  # "mock" | "real"
    hf_adapter_repo: str
    base_model: str
    hf_token: str | None
    max_image_bytes: int
    api_key: str | None = None
    max_image_pixels: int = DEFAULT_MAX_IMAGE_PIXELS
    max_image_side: int = DEFAULT_MAX_IMAGE_SIDE
    # Model load limits (AUDIT H11). Exit-on-error is off by default in every mode: there is no
    # container orchestrator (decision 2026-11-20, no Docker). Turn it on only under a supervisor that
    # restarts the process, e.g. systemd with Restart=on-failure.
    load_timeout_s: int = 1800
    # Requests allowed to wait for the model while one runs; more get 503 queue_full (AUDIT R1).
    max_queue: int = 2
    exit_on_load_error: bool = False
    # None = no pin (Hub `main`), reported as whatever commit was actually loaded.
    base_revision: str | None = DEFAULT_BASE_REVISION
    adapter_revision: str | None = DEFAULT_ADAPTER_REVISION


def _positive_int(name: str, default: int) -> int:
    """Decimal digits only and >= 1: the same rule as apps/api/src/vision/vision-config.ts (AUDIT H8)."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    if not re.fullmatch(r"[0-9]+", raw) or int(raw) < 1:
        raise ValueError(f'{name} must be a whole number >= 1 (digits only); received "{raw}".')
    return int(raw)


def _non_negative_int(name: str, default: int) -> int:
    """Decimal digits only, 0 allowed."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    if not re.fullmatch(r"[0-9]+", raw):
        raise ValueError(f'{name} must be a whole number >= 0 (digits only); received "{raw}".')
    return int(raw)


def load_settings() -> Settings:
    mode = os.environ.get("INFERENCE_MODE", "mock").strip().lower()
    if mode not in ("mock", "real"):
        raise ValueError('INFERENCE_MODE must be "mock" or "real".')
    api_key = (os.environ.get("INFERENCE_API_KEY") or "").strip() or None
    if mode == "real" and api_key is None:
        # Fail closed (AUDIT S4): without a key /v1/classify would serve anyone who reaches the GPU.
        raise ValueError(
            "INFERENCE_API_KEY is required in real mode; set the same value in apps/api/.env."
        )
    return Settings(
        mode=mode,
        hf_adapter_repo=os.environ.get("HF_ADAPTER_REPO", "Arga23/chickenstress-vlm-lora"),
        base_model=os.environ.get("HF_BASE_MODEL", "Qwen/Qwen3-VL-4B-Instruct"),
        hf_token=os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None,
        max_image_bytes=_positive_int("VISION_MAX_IMAGE_BYTES", 8 * 1024 * 1024),
        api_key=api_key,
        max_image_pixels=max_image_pixels_from_env(),
        max_image_side=_positive_int("INFERENCE_MAX_IMAGE_SIDE", DEFAULT_MAX_IMAGE_SIDE),
        load_timeout_s=_positive_int("INFERENCE_LOAD_TIMEOUT_S", 1800),
        max_queue=_non_negative_int("INFERENCE_MAX_QUEUE", 2),
        exit_on_load_error=_bool("INFERENCE_EXIT_ON_LOAD_ERROR", default=False),
        base_revision=_revision("INFERENCE_BASE_REVISION", DEFAULT_BASE_REVISION),
        adapter_revision=_revision("INFERENCE_ADAPTER_REVISION", DEFAULT_ADAPTER_REVISION),
    )


def _revision(name: str, default: str) -> str | None:
    """Unset -> the parity pin; set but empty -> no pin (None)."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip() or None


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    value = raw.strip().lower()
    if value in ("1", "true", "yes"):
        return True
    if value in ("0", "false", "no"):
        return False
    raise ValueError(f'{name} must be true or false; received "{raw}".')


def max_image_pixels_from_env() -> int:
    return _positive_int("INFERENCE_MAX_IMAGE_PIXELS", DEFAULT_MAX_IMAGE_PIXELS)

import logging
import sys
import time

from .backends import Backend
from .config import DEFAULT_MAX_IMAGE_SIDE
from .quality import run_quality_gate
from .scs import SCS_INDICATORS, apply_scs_rule, parse_vlm_json

SCHEMA_VERSION = 1

logger = logging.getLogger(__name__)


class BackendFailure(Exception):
    """The model backend raised. Carries a stable code for the client; details go to the log (R12)."""

    def __init__(self, code: str, http_status: int) -> None:
        super().__init__(code)
        self.code, self.http_status = code, http_status


def _is_out_of_memory(exc: BaseException) -> bool:
    return type(exc).__name__ == "OutOfMemoryError" or "out of memory" in str(exc).lower()


def _release_gpu_memory() -> None:
    """Best effort after an OOM. Only touches torch if real mode already imported it."""
    torch = sys.modules.get("torch")
    if torch is not None and torch.cuda.is_available():
        torch.cuda.empty_cache()


def confidence_from_result(label: str, score_stress: float) -> float | None:
    """Same formula as the notebook. Deliberate change: `undefined` -> None instead of 0.0."""
    if label == "stress":
        return score_stress
    if label == "not_stress":
        return 1 - score_stress
    return None


def classify_bytes(image_bytes: bytes, backend: Backend, max_side: int = DEFAULT_MAX_IMAGE_SIDE) -> dict:
    started = time.perf_counter()
    img, quality_status, issues = run_quality_gate(image_bytes, max_side=max_side)
    response = {
        "schema_version": SCHEMA_VERSION,
        "inference_mode": backend.mode,
        "model": backend.model_info,
        "quality": {"status": quality_status, "issues": issues},
        "result": None,
        "raw_response": None,
        "error_message": None,
    }
    if img is None:
        response["status"] = "skipped_quality"
    else:
        try:
            raw_text = backend.generate(img)
        except Exception as exc:  # noqa: BLE001 - any backend crash becomes a coded error (R12)
            # The backend's own `with lock:` has already released the lock at this point.
            logger.exception("backend.generate failed")
            if _is_out_of_memory(exc):
                _release_gpu_memory()
                raise BackendFailure("gpu_oom", 503) from exc
            raise BackendFailure("backend_error", 500) from exc
        try:
            parsed = parse_vlm_json(raw_text)
            normalized, total_ya, visible_count, label, score = apply_scs_rule(parsed.get("indicators", {}))
        except Exception as exc:  # noqa: BLE001 - notebook catches everything here too
            # Notebook mapped this to label "undefined"; here it is a distinct status.
            response["status"] = "parse_error"
            response["raw_response"] = raw_text
            response["error_message"] = str(exc)
        else:
            response["status"] = "classified"
            response["result"] = {
                "indicators": normalized,
                "total_ya": total_ya,
                "visible_count": visible_count,
                "label": label,
                "score_stress": score,
                "confidence": confidence_from_result(label, score),
            }
    response["inference_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return response


assert len(SCS_INDICATORS) == 7

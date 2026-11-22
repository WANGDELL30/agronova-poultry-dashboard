import logging
import sys
import time

from .backends import Backend
from .config import DEFAULT_MAX_IMAGE_SIDE
from .detector import Detector, model_input
from .quality import is_truncated, run_quality_gate
from .scs import SCS_INDICATORS, apply_scs_rule, parse_vlm_json

SCHEMA_VERSION = 1
# error_message of a parse_error frame (AUDIT S12): stable text, details in the service log.
PARSE_ERROR_MESSAGE = "model output is not the expected JSON with 7 indicators"

logger = logging.getLogger(__name__)


class BackendFailure(Exception):
    """The model backend raised. Carries a stable code for the client; details go to the log (R12)."""

    def __init__(self, code: str, http_status: int) -> None:
        super().__init__(code)
        self.code, self.http_status = code, http_status


class ClientDisconnected(Exception):
    """The caller left before the model ran; nothing was generated (AUDIT R1)."""


class GuardedBackend:
    """Serialises model calls and skips the model when the client has already gone (R1).

    `is_disconnected` is checked after the model lock is acquired, i.e. right before `generate`, so a
    request that waited in the queue while its client timed out does not occupy the GPU.
    """

    def __init__(self, backend: Backend, lock, is_disconnected) -> None:
        self._backend, self._lock, self._is_disconnected = backend, lock, is_disconnected
        self.mode, self.model_info = backend.mode, backend.model_info

    def generate(self, img):
        with self._lock:
            if self._is_disconnected():
                raise ClientDisconnected()
            return self._backend.generate(img)


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


def _backend_failure(exc: Exception, what: str) -> BackendFailure:
    """A crash of the model or the detector becomes a coded error; details go to the log (R12)."""
    logger.exception("%s failed", what)
    if _is_out_of_memory(exc):
        _release_gpu_memory()
        return BackendFailure("gpu_oom", 503)
    return BackendFailure("backend_error", 500)


def classify_bytes(
    image_bytes: bytes,
    backend: Backend,
    max_side: int = DEFAULT_MAX_IMAGE_SIDE,
    detector: Detector | None = None,
) -> dict:
    started = time.perf_counter()
    detection = None
    # Optional detector crop before the quality gate (AUDIT P2, INFERENCE_DETECTOR=crop). A truncated
    # file is left to the quality gate, which skips it with `gambar_rusak` (R9).
    if detector is not None and not is_truncated(image_bytes):
        try:
            image_bytes, detection = model_input(image_bytes, detector)
        except Exception as exc:  # noqa: BLE001 - same handling as a model crash
            raise _backend_failure(exc, "detector") from exc
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
    if detector is not None:
        # Present only while the detector is on, so the contract is unchanged when it is off.
        response["detection"] = detection or {"input": "full_frame", "box": None, "conf": None}
    if img is None:
        response["status"] = "skipped_quality"
    else:
        try:
            raw_text = backend.generate(img)
        except ClientDisconnected:
            raise
        except Exception as exc:  # noqa: BLE001 - any backend crash becomes a coded error (R12)
            # The backend's own `with lock:` has already released the lock at this point.
            raise _backend_failure(exc, "backend.generate") from exc
        try:
            parsed = parse_vlm_json(raw_text)
            normalized, total_ya, visible_count, label, score = apply_scs_rule(parsed.get("indicators", {}))
        except Exception as exc:  # noqa: BLE001 - notebook catches everything here too
            # Notebook mapped this to label "undefined"; here it is a distinct status. The message is
            # stable for the client; the parser's own text goes to the log (AUDIT S12). The model
            # output itself stays available in raw_response.
            logger.info("model output could not be parsed: %s", exc)
            response["status"] = "parse_error"
            response["raw_response"] = raw_text
            response["error_message"] = PARSE_ERROR_MESSAGE
        else:
            response["status"] = "classified"
            # Kept for every frame with model output, as the notebook does (AUDIT K4, decision 2026-11-13).
            response["raw_response"] = raw_text
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

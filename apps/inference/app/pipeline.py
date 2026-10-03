import time

from .backends import Backend
from .quality import run_quality_gate
from .scs import SCS_INDICATORS, apply_scs_rule, parse_vlm_json

SCHEMA_VERSION = 1


def confidence_from_result(label: str, score_stress: float) -> float | None:
    """Same formula as the notebook. Deliberate change: `undefined` -> None instead of 0.0."""
    if label == "stress":
        return score_stress
    if label == "not_stress":
        return 1 - score_stress
    return None


def classify_bytes(image_bytes: bytes, backend: Backend) -> dict:
    started = time.perf_counter()
    img, quality_status, issues = run_quality_gate(image_bytes)
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
        raw_text = backend.generate(img)
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

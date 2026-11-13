import cv2
import numpy as np

from app.quality import run_quality_gate


def sharp_jpeg(width=640, height=480, seed=0) -> bytes:
    rng = np.random.default_rng(seed)
    img = rng.integers(60, 200, (height, width, 3), dtype=np.uint8)
    return cv2.imencode(".jpg", img)[1].tobytes()


def test_truncated_jpeg_is_skipped_deterministically():
    """AUDIT R9: imdecode fills the missing part with uninitialised memory, so each call differed."""
    truncated = sharp_jpeg()[:2000]
    results = [run_quality_gate(truncated) for _ in range(3)]
    for img, status, issues in results:
        assert img is None and status == "skipped" and issues == ["gambar_rusak"]


def test_truncated_png_is_skipped():
    png = cv2.imencode(".png", np.full((480, 640, 3), 90, np.uint8))[1].tobytes()
    assert run_quality_gate(png[: len(png) // 2])[1:] == ("skipped", ["gambar_rusak"])


def test_complete_jpeg_with_trailing_bytes_is_not_flagged():
    _, status, issues = run_quality_gate(sharp_jpeg() + b"\x00trailer")
    assert "gambar_rusak" not in issues and status != "skipped"


def test_non_image_bytes_keep_the_unreadable_issue():
    assert run_quality_gate(b"not an image")[2] == ["gagal_dibaca_atau_blank"]

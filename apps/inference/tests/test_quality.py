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


# --- R2: pixel limit and downscale before the quality gate (decision 2026-11-13) ---


def test_large_image_is_downscaled_to_1280_before_the_gate(monkeypatch):
    from app import quality

    seen = []
    original = quality.quality_score
    monkeypatch.setattr(quality, "quality_score", lambda img, **kw: seen.append(None if img is None else img.shape) or original(img, **kw))
    blurry = cv2.GaussianBlur(np.random.default_rng(1).integers(0, 255, (3000, 4000, 3), dtype=np.uint8), (31, 31), 0)
    quality.run_quality_gate(cv2.imencode(".jpg", blurry)[1].tobytes())
    assert seen and all(shape == (960, 1280, 3) for shape in seen)


def test_images_up_to_1280_px_keep_their_pixels():
    data = sharp_jpeg(640, 480)
    img, status, _ = run_quality_gate(data)
    assert status == "ok"
    assert np.array_equal(img, cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR))

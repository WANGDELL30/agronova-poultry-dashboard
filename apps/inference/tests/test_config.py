import pytest

from app.config import load_settings

# Same list as apps/api/src/vision/vision-config.spec.ts: both services must agree (AUDIT H8).
REJECTED = ["-1", "0", "", "abc", "8e6", "8388608.0"]


@pytest.mark.parametrize("value", REJECTED)
def test_max_image_bytes_fails_fast(monkeypatch, value):
    monkeypatch.setenv("VISION_MAX_IMAGE_BYTES", value)
    with pytest.raises(ValueError, match="VISION_MAX_IMAGE_BYTES"):
        load_settings()


def test_max_image_bytes_accepts_digits_and_defaults(monkeypatch):
    monkeypatch.setenv("VISION_MAX_IMAGE_BYTES", "1")
    assert load_settings().max_image_bytes == 1
    monkeypatch.setenv("VISION_MAX_IMAGE_BYTES", "8388608")
    assert load_settings().max_image_bytes == 8388608
    monkeypatch.delenv("VISION_MAX_IMAGE_BYTES")
    assert load_settings().max_image_bytes == 8 * 1024 * 1024

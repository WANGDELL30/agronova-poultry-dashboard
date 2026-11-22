"""Optional detector crop before the VLM (AUDIT P2, INFERENCE_DETECTOR=crop, off by default)."""

import io
import os
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import pipeline
from app.config import Settings, load_settings
from app.detector import MIN_CROP_SIDE, Detection, crop_like_training, model_input
from app.main import create_app


def frame_png(width=320, height=240, seed=0) -> bytes:
    rng = np.random.default_rng(seed)
    img = rng.integers(60, 200, (height, width, 3), dtype=np.uint8)  # sharp noise passes the blur gate
    return cv2.imencode(".png", img)[1].tobytes()


class FakeDetector:
    def __init__(self, detections=(), error=None):
        self.detections, self.error, self.calls = list(detections), error, 0

    def detect(self, img_bgr):
        self.calls += 1
        if self.error:
            raise self.error
        return self.detections


class RecordingBackend:
    """Records the image the VLM would see."""

    mode = "mock"
    model_info = {"base_model": "m", "adapter": "a", "adapter_revision": None, "base_revision": None}

    def __init__(self):
        self.shapes = []

    def generate(self, img_bgr):
        self.shapes.append(img_bgr.shape[:2])
        return '{"indicators": {"posisi_ekor": "TIDAK"}}'


def test_crop_like_training_truncates_and_does_not_pad():
    data = crop_like_training(Image.new("RGB", (100, 80), "white"), (10.9, 5.5, 30.7, 20.2))
    assert Image.open(io.BytesIO(data)).size == (30, 20)


def test_largest_detection_is_cropped_with_the_training_rule():
    image = frame_png()
    small = Detection((0, 0, 40, 40), 0.9)
    large = Detection((50.7, 20.2, 120.9, 100.5), 0.6)
    data, detection = model_input(image, FakeDetector([small, large]))
    assert detection == {"input": "crop", "box": [50, 20, 120, 100], "conf": 0.6}
    assert data == crop_like_training(Image.open(io.BytesIO(image)), (50, 20, 120, 100))


def test_no_detection_or_a_tiny_box_keeps_the_full_frame():
    image = frame_png()
    assert model_input(image, FakeDetector()) == (image, {"input": "full_frame", "box": None, "conf": None})
    tiny = Detection((5, 5, MIN_CROP_SIDE - 1, 80), 0.8)
    data, detection = model_input(image, FakeDetector([tiny]))
    assert data == image
    assert detection == {"input": "full_frame", "box": [5, 5, MIN_CROP_SIDE - 1, 80], "conf": 0.8}
    assert model_input(b"not an image", FakeDetector([tiny]))[1]["input"] == "full_frame"


def test_classify_sends_the_crop_to_the_vlm_and_reports_it():
    backend = RecordingBackend()
    detector = FakeDetector([Detection((10, 20, 100, 80), 0.75)])
    body = pipeline.classify_bytes(frame_png(), backend, detector=detector)
    assert body["detection"] == {"input": "crop", "box": [10, 20, 100, 80], "conf": 0.75}
    assert backend.shapes == [(80, 100)]  # height, width of the crop, not the 240 x 320 frame


def test_detector_off_leaves_the_response_unchanged():
    backend = RecordingBackend()
    body = pipeline.classify_bytes(frame_png(), backend)
    assert "detection" not in body
    assert backend.shapes == [(240, 320)]


def test_a_truncated_file_skips_the_detector_and_is_skipped_by_the_quality_gate():
    detector = FakeDetector([Detection((10, 20, 100, 80), 0.75)])
    jpeg = cv2.imencode(".jpg", cv2.imdecode(np.frombuffer(frame_png(), np.uint8), cv2.IMREAD_COLOR))[1].tobytes()
    body = pipeline.classify_bytes(jpeg[: len(jpeg) // 2], RecordingBackend(), detector=detector)
    assert detector.calls == 0
    assert body["status"] == "skipped_quality" and body["quality"]["issues"] == ["gambar_rusak"]
    assert body["detection"] == {"input": "full_frame", "box": None, "conf": None}


def test_a_detector_crash_is_a_coded_backend_failure():
    with pytest.raises(pipeline.BackendFailure) as failure:
        pipeline.classify_bytes(frame_png(), RecordingBackend(), detector=FakeDetector(error=RuntimeError("x")))
    assert (failure.value.code, failure.value.http_status) == ("backend_error", 500)
    oom = type("OutOfMemoryError", (RuntimeError,), {})
    with pytest.raises(pipeline.BackendFailure) as failure:
        pipeline.classify_bytes(frame_png(), RecordingBackend(), detector=FakeDetector(error=oom("cuda")))
    assert (failure.value.code, failure.value.http_status) == ("gpu_oom", 503)


def settings(**overrides) -> Settings:
    base = dict(mode="mock", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=1_000_000)
    return Settings(**{**base, **overrides})


def test_service_loads_the_detector_only_when_switched_on():
    detector = FakeDetector([Detection((10, 20, 100, 80), 0.75)])
    with TestClient(create_app(settings(detector="crop"), detector_factory=lambda s: detector)) as client:
        body = client.post("/v1/classify", files={"file": ("f.png", frame_png(), "image/png")}).json()
    assert body["detection"]["input"] == "crop" and detector.calls == 1

    def must_not_load(_):
        raise AssertionError("detector loaded while off")

    with TestClient(create_app(settings(), detector_factory=must_not_load)) as client:
        body = client.post("/v1/classify", files={"file": ("f.png", frame_png(), "image/png")}).json()
    assert "detection" not in body


def test_a_detector_that_cannot_load_fails_the_load_with_a_generic_detail():
    def broken(_):
        raise ModuleNotFoundError("No module named 'ultralytics' (C:\\secret\\path)")

    app = create_app(settings(detector="crop"), exit_process=lambda code: None, detector_factory=broken)
    with TestClient(app) as client:
        health = client.get("/health")
    assert health.status_code == 503
    assert health.json()["status"] == "error" and "secret" not in health.json()["detail"]


def test_detector_settings_from_env(monkeypatch):
    for name in ("INFERENCE_DETECTOR", "INFERENCE_DETECTOR_WEIGHTS", "INFERENCE_DETECTOR_CONF"):
        monkeypatch.delenv(name, raising=False)
    defaults = load_settings()
    assert (defaults.detector, defaults.detector_weights, defaults.detector_conf) == ("off", "yolo11s.pt", 0.25)
    monkeypatch.setenv("INFERENCE_DETECTOR", " Crop ")
    monkeypatch.setenv("INFERENCE_DETECTOR_WEIGHTS", "/opt/agronova/yolo11s.pt")
    monkeypatch.setenv("INFERENCE_DETECTOR_CONF", "0.4")
    s = load_settings()
    assert (s.detector, s.detector_weights, s.detector_conf) == ("crop", "/opt/agronova/yolo11s.pt", 0.4)
    for bad in ("yes", "on", "classify"):
        monkeypatch.setenv("INFERENCE_DETECTOR", bad)
        with pytest.raises(ValueError, match="INFERENCE_DETECTOR"):
            load_settings()
    monkeypatch.setenv("INFERENCE_DETECTOR", "off")
    for bad in ("0", "1", "1.5", "-0.2", "abc", "0.25 "):
        monkeypatch.setenv("INFERENCE_DETECTOR_CONF", bad)
        if bad.strip() == "0.25":
            assert load_settings().detector_conf == 0.25
            continue
        with pytest.raises(ValueError, match="INFERENCE_DETECTOR_CONF"):
            load_settings()


REPO = Path(__file__).resolve().parents[3]
RAW = REPO / "_tmp_raw/Data"
WEIGHTS = os.environ.get("INFERENCE_DETECTOR_TEST_WEIGHTS")


@pytest.mark.skipif(
    not (WEIGHTS and RAW.exists()),
    reason="set INFERENCE_DETECTOR_TEST_WEIGHTS to a local yolo11s.pt (ultralytics installed) and keep _tmp_raw/Data",
)
def test_yolo_detector_reproduces_the_tuned_evaluation():
    """The service's own detector on the 51 labelled frames: a crop in every frame, on a chicken in 46."""
    from app.detector import YoloDetector
    from scripts.p2_eval import Box, load_ground_truth, matched_instance

    frames = load_ground_truth(REPO / "results/vlm/pipeline_all_df.csv", REPO / "docs/manifest/manifest_instance.csv")
    detector = YoloDetector(WEIGHTS)
    cropped = on_chicken = 0
    for name, frame in frames.items():
        _, detection = model_input((RAW / frame.split / name).read_bytes(), detector)
        if detection["input"] == "crop":
            cropped += 1
            on_chicken += matched_instance(frame, Box(*detection["box"])) is not None
    assert (cropped, on_chicken) == (51, 46)

"""Optional chicken detector before the VLM (AUDIT P2; decision 2026-11-22: off by default).

With `INFERENCE_DETECTOR=crop` the largest detected animal is cropped with the training rule and that
crop goes through the quality gate and the VLM instead of the full frame. The P2 evaluation found the
full frame more accurate on the dataset (36/42 vs 31/42 for annotated crops), so this exists to be
tried on pilot frames, not as the default.

Detector settings were tuned without retraining (2026-11-22, a fresh model per setting): COCO YOLO11s
at 640 px, every animal class counted (a chicken is often called something other than "bird"),
class-agnostic NMS, test-time augmentation, confidence 0.25. On the 22 frames the old detector never
saw: largest box on a chicken 20/22 (default settings 16/22), a detection in every frame, 0.23 false
boxes per frame; on all 51 frames 46/51. TTA makes the detector about 2.6x slower (435 ms on a laptop
CPU), still small next to the VLM. 960 px was worse. Ultralytics is AGPL-3.0, so it is an optional
dependency (requirements-detector.txt) and is only imported when the detector is switched on.
"""

from __future__ import annotations

import io
import threading
from typing import NamedTuple, Protocol

import cv2
import numpy as np
from PIL import Image

DETECTOR_MODES = ("off", "crop")
DEFAULT_DETECTOR_WEIGHTS = "yolo11s.pt"
DEFAULT_DETECTOR_CONF = 0.25
# COCO 14 bird ... 23 giraffe. Chickens are also detected as cat, dog, sheep, and so on.
COCO_ANIMAL_CLASSES = tuple(range(14, 24))
DETECTOR_IOU = 0.5
DETECTOR_TTA = True  # Ultralytics `augment`: flipped and rescaled passes, merged
# A smaller box is not a usable chicken crop; the full frame is used instead.
MIN_CROP_SIDE = 32


class Detection(NamedTuple):
    box: tuple[float, float, float, float]  # x, y, width, height in pixels
    conf: float


class Detector(Protocol):
    def detect(self, img_bgr: np.ndarray) -> list[Detection]: ...


def crop_like_training(image: Image.Image, box: tuple[float, float, float, float]) -> bytes:
    """The training crop (chickenstress-kaggle.ipynb cell 31): RGB, int() of x, y, w, h, a plain PIL
    crop of exactly that box (no padding), saved as JPEG with PIL defaults like `crop.save`.
    tests/test_p2_eval.py checks it against the committed training crops pixel for pixel."""
    x, y, w, h = (int(v) for v in box)
    out = io.BytesIO()
    image.convert("RGB").crop((x, y, x + w, y + h)).save(out, format="JPEG")
    return out.getvalue()


class YoloDetector:
    """COCO YOLO with the tuned settings above. One prediction at a time (the model is not thread-safe)."""

    def __init__(self, weights: str = DEFAULT_DETECTOR_WEIGHTS, conf: float = DEFAULT_DETECTOR_CONF) -> None:
        # Optional and AGPL-3.0: see requirements-detector.txt.
        from ultralytics import YOLO

        self._model = YOLO(weights)
        self._conf = conf
        self._lock = threading.Lock()

    def detect(self, img_bgr: np.ndarray) -> list[Detection]:
        with self._lock:
            result = self._model.predict(
                img_bgr,
                conf=self._conf,
                iou=DETECTOR_IOU,
                classes=list(COCO_ANIMAL_CLASSES),
                agnostic_nms=True,
                augment=DETECTOR_TTA,
                verbose=False,
            )[0]
        return [
            Detection((x1, y1, x2 - x1, y2 - y1), float(c))
            for (x1, y1, x2, y2), c in zip(result.boxes.xyxy.tolist(), result.boxes.conf.tolist())
        ]


def model_input(image_bytes: bytes, detector: Detector) -> tuple[bytes, dict]:
    """The bytes for the quality gate and the `detection` record of the response.

    The largest detection is cropped when both sides are at least MIN_CROP_SIDE; otherwise, or when
    nothing is found or the image cannot be decoded, the full frame is used unchanged. The detector
    never decides that a frame shows no chicken: that would need its own status (P2 step 2).
    """
    full_frame = {"input": "full_frame", "box": None, "conf": None}
    img_bgr = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img_bgr is None:
        return image_bytes, full_frame
    detections = detector.detect(img_bgr)
    if not detections:
        return image_bytes, full_frame
    top = max(detections, key=lambda d: max(d.box[2], 0.0) * max(d.box[3], 0.0))
    x, y, w, h = (int(v) for v in top.box)
    found = {"box": [x, y, w, h], "conf": round(top.conf, 4)}
    if w < MIN_CROP_SIDE or h < MIN_CROP_SIDE:
        return image_bytes, {"input": "full_frame", **found}
    with Image.open(io.BytesIO(image_bytes)) as image:
        crop = crop_like_training(image, (x, y, w, h))
    return crop, {"input": "crop", **found}

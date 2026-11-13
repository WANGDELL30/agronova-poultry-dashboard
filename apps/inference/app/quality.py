"""Quality gate. quality_score/enhance_image copied UNCHANGED from notebook 04 (cell 5)."""
from io import BytesIO

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError


def quality_score(img_bgr, blur_threshold=100, dark_thresh=40, bright_thresh=215):
    """[A] Quality Scoring -- dijalankan cepat, TANPA deep learning, di edge device
    sebelum citra dikirim ke model klasifikasi."""
    if img_bgr is None:
        return {"ok": False, "issues": ["gagal_dibaca_atau_blank"]}
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    brightness = float(gray.mean())
    is_blank = bool(gray.std() < 3)
    issues = []
    if laplacian_var < blur_threshold: issues.append("blur")
    if brightness < dark_thresh: issues.append("terlalu_gelap")
    if brightness > bright_thresh: issues.append("terlalu_terang")
    if is_blank: issues.append("blank_or_occluded")
    return {"ok": len(issues) == 0, "laplacian_var": laplacian_var, "brightness": brightness,
            "is_blank": is_blank, "issues": issues}


def enhance_image(img_bgr):
    """[C] Perbaikan ringan: CLAHE + denoising + sharpening -- HANYA di inference."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    enhanced = cv2.fastNlMeansDenoisingColored(enhanced, None, h=5, hColor=5, templateWindowSize=7, searchWindowSize=21)
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    return cv2.filter2D(enhanced, -1, sharpen_kernel)


_JPEG_SOI, _JPEG_EOI = b"\xff\xd8", b"\xff\xd9"
_PNG_SIGNATURE, _PNG_IEND = b"\x89PNG\r\n\x1a\n", b"IEND\xaeB`\x82"


def is_truncated(image_bytes: bytes) -> bool:
    """True for a JPEG/PNG/WebP cut off mid-file (AUDIT R9). Deliberate deviation from notebook 04.

    cv2.imdecode fills the missing part of a truncated JPEG with uninitialised memory, so the quality
    gate gave a different answer on every call. A file that ends with its end marker is accepted
    without decoding; anything else is checked with a full Pillow decode. Bytes Pillow does not
    recognise as an image are left to cv2 (reported as `gagal_dibaca_atau_blank`).
    """
    if image_bytes.startswith(_JPEG_SOI) and image_bytes.endswith(_JPEG_EOI):
        return False
    if image_bytes.startswith(_PNG_SIGNATURE) and image_bytes.endswith(_PNG_IEND):
        return False
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        if int.from_bytes(image_bytes[4:8], "little") + 8 == len(image_bytes):
            return False
    try:
        with Image.open(BytesIO(image_bytes)) as img:
            img.load()
    except UnidentifiedImageError:
        return False
    except Exception:  # noqa: BLE001 - any decode failure of a recognised image means a damaged file
        return True
    return False


def run_quality_gate(image_bytes, blur_threshold=100):
    """Bytes variant of `image_quality_gate` (same [A]->[C] flow, no file path / skip log).

    Returns (img_bgr | None, status, issues). `issues` = problems that were fixed when
    status == "enhanced", or the remaining problems when status == "skipped".
    Deliberate change: an undecodable image is reported as skipped (notebook would crash in
    enhance_image(None)). A truncated file is skipped with `gambar_rusak` before decoding (R9).
    """
    if is_truncated(image_bytes):
        return None, "skipped", ["gambar_rusak"]
    img_bgr = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    score = quality_score(img_bgr, blur_threshold=blur_threshold)
    if score["ok"]:
        return img_bgr, "ok", []
    if img_bgr is None:
        return None, "skipped", score["issues"]
    enhanced = enhance_image(img_bgr)
    score_after = quality_score(enhanced, blur_threshold=blur_threshold)
    if score_after["ok"]:
        return enhanced, "enhanced", score["issues"]
    return None, "skipped", score_after["issues"]

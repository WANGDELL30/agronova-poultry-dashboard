"""Quality gate. quality_score/enhance_image copied UNCHANGED from notebook 04 (cell 5)."""
import cv2
import numpy as np


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


def run_quality_gate(image_bytes, blur_threshold=100):
    """Bytes variant of `image_quality_gate` (same [A]->[C] flow, no file path / skip log).

    Returns (img_bgr | None, status, issues). `issues` = problems that were fixed when
    status == "enhanced", or the remaining problems when status == "skipped".
    Deliberate change: an undecodable image is reported as skipped (notebook would crash in
    enhance_image(None)).
    """
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

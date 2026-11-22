"""P2 step 1: evaluate chicken detectors and the VLM on detector crops (AUDIT P2, decision 2026-11-13).

Pure helpers used by `apps/inference/colab/p2_detector_eval_colab.ipynb`. No GPU, no ultralytics here:
detections come in as plain tuples, so the logic is tested locally (tests/test_p2_eval.py).

Ground truth: `results/vlm/pipeline_all_df.csv` (boxes; `_is_rep_box` = the largest box per chicken,
the one the training notebook cropped) and `docs/manifest/manifest_instance.csv` (`label_akhir`, the
SCS label from the manual indicator annotation, which is what the adapter learned to reproduce).
"""

from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from app.detector import crop_like_training as _service_crop

IOU_MATCH = 0.5
BINARY_LABELS = ("stress", "not_stress")


@dataclass(frozen=True)
class Box:
    """Pixel box as x, y, width, height (COCO convention, like the training data)."""

    x: float
    y: float
    w: float
    h: float

    @property
    def area(self) -> float:
        return max(self.w, 0.0) * max(self.h, 0.0)


@dataclass(frozen=True)
class Instance:
    key: str
    box: Box
    label: str  # stress | not_stress | undefined (manifest label_akhir)


@dataclass
class Frame:
    file_name: str
    split: str
    instances: list[Instance] = field(default_factory=list)  # largest box first

    @property
    def largest(self) -> Instance:
        return self.instances[0]


@dataclass(frozen=True)
class Detection:
    box: Box
    conf: float


def load_ground_truth(pipeline_csv: Path, manifest_csv: Path) -> dict[str, Frame]:
    """One Frame per image with its representative boxes, largest first."""
    labels = {
        row["instance_key"]: row["label_akhir"]
        for row in csv.DictReader(open(manifest_csv, encoding="utf-8-sig"))
    }
    frames: dict[str, Frame] = {}
    for row in csv.DictReader(open(pipeline_csv, encoding="utf-8")):
        if row["_is_rep_box"] != "True":
            continue
        frame = frames.setdefault(row["file_name"], Frame(row["file_name"], row["source_split"]))
        box = Box(float(row["x"]), float(row["y"]), float(row["w"]), float(row["h"]))
        frame.instances.append(Instance(row["instance_key"], box, labels[row["instance_key"]]))
    for frame in frames.values():
        frame.instances.sort(key=lambda inst: inst.box.area, reverse=True)
    return frames


def crop_like_training(image: Image.Image | Path | str, box: Box) -> bytes:
    """The training crop, from the service itself (app.detector), so evaluation and service agree."""
    img = image if isinstance(image, Image.Image) else Image.open(image)
    return _service_crop(img, (box.x, box.y, box.w, box.h))


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
    iy = max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
    inter = ix * iy
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0


def largest_detection(detections: list[Detection], conf: float) -> Detection | None:
    kept = [d for d in detections if d.conf >= conf]
    return max(kept, key=lambda d: d.box.area) if kept else None


def matched_instance(frame: Frame, box: Box, threshold: float = IOU_MATCH) -> Instance | None:
    """The annotated chicken a box covers best, if the overlap reaches the threshold."""
    best = max(frame.instances, key=lambda inst: iou(inst.box, box))
    return best if iou(best.box, box) >= threshold else None


def detector_metrics(
    frames: dict[str, Frame],
    detections: dict[str, list[Detection]],
    conf: float,
    threshold: float = IOU_MATCH,
) -> dict[str, float]:
    """Quality of one detector at one confidence threshold, from the point of view of P2: does the
    largest box land on a chicken (ideally the largest annotated one), and how much else is boxed."""
    n = len(frames)
    with_det = hits_any = hits_largest = 0
    gt_total = gt_found = false_pos = 0
    ious: list[float] = []
    for name, frame in frames.items():
        kept = [d for d in detections.get(name, []) if d.conf >= conf]
        gt_total += len(frame.instances)
        # Greedy one-to-one matching, highest confidence first.
        free = list(frame.instances)
        for det in sorted(kept, key=lambda d: d.conf, reverse=True):
            best = max(free, key=lambda inst: iou(inst.box, det.box), default=None)
            if best is not None and iou(best.box, det.box) >= threshold:
                free.remove(best)
                gt_found += 1
            else:
                false_pos += 1
        top = largest_detection(kept, 0.0)
        if top is None:
            continue
        with_det += 1
        best_iou = max(iou(inst.box, top.box) for inst in frame.instances)
        ious.append(best_iou)
        hits_any += best_iou >= threshold
        hits_largest += iou(frame.largest.box, top.box) >= threshold
    return {
        "conf": conf,
        "frames": n,
        "frames_with_detection": with_det,
        "no_chicken_rate": round(1 - with_det / n, 4) if n else 0.0,
        "largest_hits_a_chicken": round(hits_any / n, 4) if n else 0.0,
        "largest_hits_largest_chicken": round(hits_largest / n, 4) if n else 0.0,
        "chicken_recall": round(gt_found / gt_total, 4) if gt_total else 0.0,
        "false_boxes_per_frame": round(false_pos / n, 3) if n else 0.0,
        "mean_iou_largest": round(sum(ious) / len(ious), 4) if ious else 0.0,
    }


def summarize_vlm(rows: list[dict]) -> dict[str, dict]:
    """Per input kind (full / gt_crop / det_crop): accuracy against the matched chicken's SCS label.

    Each row: {"input": str, "gt_label": str | None, "status": str, "pred_label": str | None}.
    `gt_label` None = the detector crop matched no annotated chicken; `status` "no_chicken" = the
    detector found nothing. Accuracy only counts chickens labelled stress/not_stress.
    """
    out: dict[str, dict] = {}
    for kind in sorted({r["input"] for r in rows}):
        mine = [r for r in rows if r["input"] == kind]
        scored = [r for r in mine if r["gt_label"] in BINARY_LABELS]
        correct = sum(r["pred_label"] == r["gt_label"] for r in scored)
        out[kind] = {
            "frames": len(mine),
            "scored": len(scored),
            "correct": correct,
            "accuracy": round(correct / len(scored), 4) if scored else None,
            "stress_false_alarms": sum(
                r["gt_label"] == "not_stress" and r["pred_label"] == "stress" for r in scored
            ),
            "stress_missed": sum(
                r["gt_label"] == "stress" and r["pred_label"] != "stress" for r in scored
            ),
            "statuses": dict(Counter(r["status"] for r in mine)),
            "pred_labels": dict(Counter(str(r["pred_label"]) for r in mine)),
            "no_chicken": sum(r["status"] == "no_chicken" for r in mine),
            "unmatched_crop": sum(r["gt_label"] is None and r["status"] != "no_chicken" for r in mine),
        }
    return out

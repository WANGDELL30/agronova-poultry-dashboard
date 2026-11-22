"""Helpers behind the P2 detector evaluation notebook (AUDIT P2)."""

import csv
import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from scripts.p2_eval import (
    Box,
    Detection,
    Frame,
    Instance,
    crop_like_training,
    detector_metrics,
    iou,
    largest_detection,
    load_ground_truth,
    matched_instance,
    summarize_vlm,
)

REPO = Path(__file__).resolve().parents[3]
PIPELINE = REPO / "results/vlm/pipeline_all_df.csv"
MANIFEST = REPO / "docs/manifest/manifest_instance.csv"
RAW = REPO / "_tmp_raw/Data"  # Roboflow export; not in git, so the crop parity test may skip


def test_ground_truth_has_51_frames_and_69_chickens_largest_first():
    frames = load_ground_truth(PIPELINE, MANIFEST)
    assert len(frames) == 51
    assert sum(len(f.instances) for f in frames.values()) == 69
    for frame in frames.values():
        areas = [inst.box.area for inst in frame.instances]
        assert areas == sorted(areas, reverse=True)
        assert all(inst.label in ("stress", "not_stress", "undefined") for inst in frame.instances)


def test_iou_and_matching():
    a = Box(0, 0, 10, 10)
    assert iou(a, a) == 1.0
    assert iou(a, Box(20, 20, 5, 5)) == 0.0
    assert iou(a, Box(5, 0, 10, 10)) == pytest.approx(50 / 150)
    frame = Frame("f", "train", [Instance("big", Box(0, 0, 100, 100), "stress"), Instance("small", Box(200, 0, 20, 20), "not_stress")])
    assert matched_instance(frame, Box(2, 2, 96, 96)).key == "big"
    assert matched_instance(frame, Box(201, 1, 19, 19)).key == "small"
    assert matched_instance(frame, Box(400, 400, 10, 10)) is None


def test_largest_detection_respects_the_confidence_threshold():
    dets = [Detection(Box(0, 0, 50, 50), 0.2), Detection(Box(0, 0, 10, 10), 0.9)]
    assert largest_detection(dets, 0.1).conf == 0.2
    assert largest_detection(dets, 0.5).conf == 0.9
    assert largest_detection(dets, 0.95) is None


def test_crop_like_training_truncates_and_does_not_pad():
    img = Image.new("RGB", (100, 80), "white")
    data = crop_like_training(img, Box(10.9, 5.5, 30.7, 20.2))
    assert Image.open(io.BytesIO(data)).size == (30, 20)  # int(), like the training notebook


def test_detector_metrics_counts_hits_misses_and_false_boxes():
    frames = {
        "one": Frame("one", "train", [Instance("a", Box(0, 0, 100, 100), "stress")]),
        "two": Frame("two", "train", [Instance("b", Box(0, 0, 100, 100), "not_stress"), Instance("c", Box(300, 0, 50, 50), "stress")]),
        "none": Frame("none", "train", [Instance("d", Box(0, 0, 100, 100), "stress")]),
    }
    detections = {
        "one": [Detection(Box(0, 0, 98, 98), 0.9), Detection(Box(500, 500, 10, 10), 0.8)],
        "two": [Detection(Box(300, 0, 50, 50), 0.7)],  # finds only the smaller chicken
        "none": [Detection(Box(0, 0, 100, 100), 0.05)],  # below the threshold
    }
    m = detector_metrics(frames, detections, conf=0.25)
    assert m["frames_with_detection"] == 2
    assert m["no_chicken_rate"] == pytest.approx(1 / 3, abs=1e-3)
    assert m["largest_hits_a_chicken"] == pytest.approx(2 / 3, abs=1e-3)
    assert m["largest_hits_largest_chicken"] == pytest.approx(1 / 3, abs=1e-3)
    assert m["chicken_recall"] == pytest.approx(2 / 4)
    assert m["false_boxes_per_frame"] == pytest.approx(1 / 3, abs=1e-3)


def test_summarize_vlm_scores_only_binary_labels_and_counts_misses():
    rows = [
        {"input": "det_crop", "gt_label": "stress", "status": "classified", "pred_label": "stress"},
        {"input": "det_crop", "gt_label": "not_stress", "status": "classified", "pred_label": "stress"},
        {"input": "det_crop", "gt_label": "undefined", "status": "classified", "pred_label": "undefined"},
        {"input": "det_crop", "gt_label": None, "status": "classified", "pred_label": "stress"},
        {"input": "det_crop", "gt_label": "stress", "status": "no_chicken", "pred_label": None},
    ]
    s = summarize_vlm(rows)["det_crop"]
    assert (s["scored"], s["correct"], s["accuracy"]) == (3, 1, pytest.approx(1 / 3, abs=1e-3))
    assert s["stress_false_alarms"] == 1 and s["stress_missed"] == 1
    assert s["no_chicken"] == 1 and s["unmatched_crop"] == 1


@pytest.mark.skipif(not RAW.exists(), reason="raw Roboflow export (_tmp_raw/Data) not available")
def test_crop_matches_the_committed_training_crops():
    """The crop rule reproduces the training crops pixel for pixel. The only exceptions are frames the
    training notebook sharpened before cropping (data/working/blur_sharpening_log.csv)."""
    frames = load_ground_truth(PIPELINE, MANIFEST)
    by_key = {inst.key: (frame, inst) for frame in frames.values() for inst in frame.instances}
    sharpened = {
        row["file_name"]
        for row in csv.DictReader(open(REPO / "data/working/blur_sharpening_log.csv", encoding="utf-8"))
    }
    identical = differing = 0
    for row in csv.DictReader(open(MANIFEST, encoding="utf-8-sig")):
        crop_file = REPO / "data/working/dataset" / row["file_crop_final"]
        if not row["file_crop_final"] or not crop_file.exists():
            continue
        frame, inst = by_key[row["instance_key"]]
        ours = Image.open(io.BytesIO(crop_like_training(RAW / frame.split / frame.file_name, inst.box)))
        theirs = Image.open(crop_file).convert("RGB")
        assert ours.size == theirs.size, row["instance_key"]
        diff = np.abs(np.asarray(ours, dtype=np.int16) - np.asarray(theirs, dtype=np.int16)).mean()
        if frame.file_name in sharpened:
            differing += 1
        else:
            assert diff == 0.0, (row["instance_key"], diff)
            identical += 1
    assert identical >= 60 and differing <= 5

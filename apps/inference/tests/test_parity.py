import json

import cv2
import numpy as np

from scripts.parity_check import compare, main


def write_images(tmp_path, n=4):
    for i in range(n):
        rng = np.random.default_rng(i)
        cv2.imwrite(str(tmp_path / f"img{i}.png"), rng.integers(60, 200, (120, 160, 3), dtype=np.uint8))
    cv2.imwrite(str(tmp_path / "blank.png"), np.full((120, 160, 3), 128, np.uint8))


def test_identical_reference_passes_and_tampering_is_detected(tmp_path):
    write_images(tmp_path)
    ref, report = tmp_path / "ref.json", tmp_path / "report.json"
    base = ["--backend", "mock", "--reference", str(ref), "--images", str(tmp_path), "--report", str(report)]
    assert main(base + ["--write-reference"]) == 0
    assert json.loads(report.read_text())["mismatched"] == 0

    data = json.loads(ref.read_text())
    classified = next(i for i in data["items"] if i["result"])
    classified["result"]["total_ya"] += 1
    ref.write_text(json.dumps(data))
    assert main(base) == 1
    assert json.loads(report.read_text())["mismatched"] == 1


def test_compare_flags_quality_and_presence_differences():
    ours = {"quality": {"status": "ok"}, "result": None, "status": "skipped_quality"}
    problems = compare({"file": "a", "quality_status": "enhanced", "result": {"label": "stress"}}, ours)
    assert any("quality_status" in p for p in problems) and any("result presence" in p for p in problems)

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


def test_notebook_parse_error_maps_to_the_service_parse_error_status():
    """The notebook keeps a parse failure as label `undefined`; the service reports `parse_error` (P8)."""
    ref = {"file": "a", "quality_status": "ok", "result": {"label": "undefined", "raw_response": "x", "parse_error": "no JSON"}}
    ours = {"quality": {"status": "ok"}, "result": None, "status": "parse_error", "raw_response": "x"}
    assert compare(ref, ours) == []
    assert any("status" in p for p in compare(ref, {**ours, "status": "classified", "result": {"label": "undefined"}}))


def test_raw_text_is_compared_when_both_sides_have_it():
    ref = {"file": "a", "quality_status": "ok", "result": {"label": "undefined", "raw_response": "abc", "parse_error": "e"}}
    ours = {"quality": {"status": "ok"}, "result": None, "status": "parse_error", "raw_response": "abd"}
    assert any("raw_response" in p for p in compare(ref, ours))


def test_write_reference_finds_jpeg_and_upper_case_extensions(tmp_path):
    img = np.random.default_rng(0).integers(60, 200, (120, 160, 3), dtype=np.uint8)
    for name in ("a.jpeg", "b.JPG", "c.PNG", "d.jpg"):
        (tmp_path / name).write_bytes(cv2.imencode(".jpg" if "j" in name.lower() else ".png", img)[1].tobytes())
    ref = tmp_path / "ref.json"
    args = ["--backend", "mock", "--reference", str(ref), "--images", str(tmp_path), "--report", str(tmp_path / "r.json")]
    assert main(args + ["--write-reference"]) == 0
    assert sorted(i["file"] for i in json.loads(ref.read_text())["items"]) == ["a.jpeg", "b.JPG", "c.PNG", "d.jpg"]


def test_coverage_warns_when_a_quality_path_has_too_few_images():
    """AUDIT P4: the official procedure compared only 2 `ok` images."""
    from scripts.parity_check import MIN_IMAGES_PER_PATH, coverage_warnings

    items = [{"quality_status": "ok"}] * 2
    warnings = coverage_warnings(items)
    assert len(warnings) == 3 and all("below the minimum" in w for w in warnings)
    enough = [{"quality_status": s} for s, n in MIN_IMAGES_PER_PATH.items() for _ in range(n)]
    assert coverage_warnings(enough) == []

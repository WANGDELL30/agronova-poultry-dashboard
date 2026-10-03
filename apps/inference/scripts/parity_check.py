"""Parity check: service pipeline vs results exported from notebook 04.

Kaggle (GPU):  python scripts/parity_check.py --reference /kaggle/working/notebook_reference.json
Local self-test (no GPU):  python scripts/parity_check.py --backend mock --reference ref.json --write-reference
Exit code 0 only when every compared field matches for every image.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline import classify_bytes  # noqa: E402

COMPARED = ("label", "total_ya", "visible_count", "score_stress", "indicators")


def compare(reference_item: dict, ours: dict) -> list[str]:
    """Return human-readable mismatches between one notebook reference item and our response."""
    problems = []
    quality = ours["quality"]["status"]
    if reference_item["quality_status"] != quality:
        problems.append(f"quality_status: notebook={reference_item['quality_status']} service={quality}")
    ref = reference_item.get("result")
    if ref is None or ours["result"] is None:
        if (ref is None) != (ours["result"] is None):
            problems.append(f"result presence: notebook={ref is not None} service={ours['result'] is not None} (status={ours['status']})")
        return problems
    for key in COMPARED:
        if ref.get(key) != ours["result"].get(key):
            problems.append(f"{key}: notebook={ref.get(key)!r} service={ours['result'].get(key)!r}")
    return problems


def make_backend(name: str):
    from app.backends import MockBackend, RealBackend
    from app.config import load_settings

    return MockBackend() if name == "mock" else RealBackend(load_settings())


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True)
    ap.add_argument("--images", help="override image dir stored in the reference file")
    ap.add_argument("--backend", choices=("real", "mock"), default="real")
    ap.add_argument("--write-reference", action="store_true", help="(mock self-test only) create the reference from the backend itself")
    ap.add_argument("--report", default="parity_report.json")
    args = ap.parse_args(argv)

    backend = make_backend(args.backend)
    if args.write_reference:
        if args.backend != "mock":
            ap.error("--write-reference is only for the local mock self-test")
        image_dir = Path(args.images or ".")
        items = []
        for path in sorted(image_dir.glob("*.[jp][pn]g")):
            r = classify_bytes(path.read_bytes(), backend)
            items.append({"file": path.name, "quality_status": r["quality"]["status"], "result": r["result"]})
        Path(args.reference).write_text(json.dumps({"image_dir": str(image_dir), "items": items}))

    ref = json.loads(Path(args.reference).read_text())
    image_dir = Path(args.images or ref["image_dir"])
    report, failures = [], 0
    for item in ref["items"]:
        ours = classify_bytes((image_dir / item["file"]).read_bytes(), backend)
        problems = compare(item, ours)
        failures += bool(problems)
        report.append({"file": item["file"], "ok": not problems, "problems": problems, "service_status": ours["status"], "raw_response": ours["raw_response"]})
        print(("OK   " if not problems else "DIFF ") + item["file"] + "".join(f"\n       {p}" for p in problems))
    Path(args.report).write_text(json.dumps({"backend": args.backend, "model": backend.model_info, "total": len(report), "mismatched": failures, "items": report}, indent=2))
    print(f"\n{len(report) - failures}/{len(report)} identical; report -> {args.report}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

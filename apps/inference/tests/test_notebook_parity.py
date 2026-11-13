"""Static parity checks against the notebook itself (AUDIT P8): no model, no GPU.

`test_parity.py` only compares the service with a reference it wrote itself (mock vs mock). These
tests execute the notebook's own SCS cell and lock the prompt, so a drift is caught in CI.
"""
import hashlib
import itertools
import json
import re
from pathlib import Path

import pytest

from app import scs

REPO = Path(__file__).resolve().parents[3]
NOTEBOOK = REPO / "training" / "vlm-workflow" / "inference-vlm-lora-huggingface.ipynb"
EXPERIMENTS = REPO / "results" / "vlm" / "vlm_experiments.json"
SCS_CELL = 7  # "7 indikator SCS + aturan" in notebook 04

# Locked on 2026-11-13. A prompt change must be deliberate: update these hashes in the same commit.
SYSTEM_PROMPT_SHA256 = "a1855f88fbb3188ebaf4008d97582158b40d5dd78cf389137d245d2e9dfb8d13"
USER_PROMPT_SHA256 = "d94daabc54dd5ed74a92b15faefb62d8ebf276143f46c7abe380cb7455cf331f"


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@pytest.fixture(scope="module")
def notebook():
    cell = json.loads(NOTEBOOK.read_text(encoding="utf-8"))["cells"][SCS_CELL]
    source = "".join(cell["source"])
    assert "SCS_INDICATORS" in source, "cell index moved; update SCS_CELL"
    namespace = {"json": json, "re": re}
    exec(compile(source, f"{NOTEBOOK.name}[{SCS_CELL}]", "exec"), namespace)  # noqa: S102 - our own notebook
    return namespace


def test_notebook_cell_has_the_same_constants_and_prompts(notebook):
    for name in ("SCS_INDICATORS", "STRESS_THRESHOLD", "MIN_VISIBLE_INDICATORS", "CLASS_NAMES_3",
                 "SCS_SYSTEM_PROMPT", "SCS_USER_PROMPT"):
        assert notebook[name] == getattr(scs, name), name


def test_notebook_rule_matches_on_every_answer_combination(notebook):
    keys = [ind["key"] for ind in scs.SCS_INDICATORS]
    for answers in itertools.product(["YA", "TIDAK", "TIDAK_TERLIHAT"], repeat=len(keys)):
        given = dict(zip(keys, answers))
        assert notebook["apply_scs_rule"](given) == scs.apply_scs_rule(given)
    for raw in ["ya", " Ya ", "tidak terlihat", "TT", "N/A", "", "none", "Tidak", "maybe", None, 1]:
        assert notebook["normalize_indicator_answer"](raw) == scs.normalize_indicator_answer(raw)
    text = 'noise {"indicators": {"posisi_ekor": "YA"}, "label": "x"} trailer'
    assert notebook["parse_vlm_json"](text) == scs.parse_vlm_json(text)


def test_service_prompts_are_locked():
    assert sha256(scs.SCS_SYSTEM_PROMPT) == SYSTEM_PROMPT_SHA256
    assert sha256(scs.SCS_USER_PROMPT) == USER_PROMPT_SHA256


@pytest.mark.xfail(reason="P1: prompt layanan belum diganti ke prompt training")
def test_service_prompt_equals_the_training_prompt():
    meta = json.loads(EXPERIMENTS.read_text(encoding="utf-8"))["_meta"]
    assert sha256(scs.SCS_SYSTEM_PROMPT) == sha256(meta["system_prompt"])

"""Colab notebooks are committed without outputs (AUDIT S19).

A run prints the INFERENCE_API_KEY (and the chatbot notebook its LLM key) so it can be copied into
the API; a notebook saved after a run would carry that key into git. The training notebooks under
`training/` keep their outputs on purpose (evidence) and are not checked here.
"""

import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
NOTEBOOKS = sorted((REPO / "apps").glob("*/colab/*.ipynb"))


def test_colab_notebooks_are_found():
    assert any(p.name == "run_inference_colab.ipynb" for p in NOTEBOOKS)


@pytest.mark.parametrize("path", NOTEBOOKS, ids=lambda p: str(p.relative_to(REPO)))
def test_colab_notebook_has_no_outputs(path):
    notebook = json.loads(path.read_text(encoding="utf-8"))
    for index, cell in enumerate(notebook["cells"]):
        if cell["cell_type"] != "code":
            continue
        assert cell.get("outputs") == [], f"cell {index} has outputs: clear them before committing"
        assert cell.get("execution_count") is None, f"cell {index} has an execution count"


def test_inference_notebook_prints_the_full_key_only_in_its_own_last_cell():
    notebook = json.loads((REPO / "apps/inference/colab/run_inference_colab.ipynb").read_text("utf-8"))
    code = ["".join(c["source"]) for c in notebook["cells"] if c["cell_type"] == "code"]
    full = 'print("INFERENCE_API_KEY=" + os.environ["INFERENCE_API_KEY"])'
    assert [i for i, source in enumerate(code) if full in source] == [len(code) - 1]
    assert "Clear output" in code[-1]

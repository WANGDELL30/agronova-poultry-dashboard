"""AUDIT P7: report the revision of what was actually loaded, not a fresh Hub query of `main`."""
import sys
import types

from app.backends import MockBackend, adapter_revision, base_revision


class Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def test_base_revision_comes_from_the_loaded_config():
    model = Obj(config=Obj(_commit_hash="abc123"))
    assert base_revision(model) == "abc123"
    assert base_revision(Obj(config=Obj())) is None  # local folder: transformers sets no hash


def test_adapter_revision_comes_from_the_loaded_peft_config():
    peft_model = Obj(peft_config={"default": Obj(_commit_hash="def456")})
    assert adapter_revision(peft_model, "org/adapter") == "def456"


def test_adapter_revision_falls_back_to_the_cached_snapshot_offline(monkeypatch):
    """With HF_HUB_OFFLINE the weights come from the cache; its snapshot folder is the commit."""
    fake_hub = types.ModuleType("huggingface_hub")
    fake_hub.try_to_load_from_cache = lambda repo, name: (
        f"/cache/models--org--adapter/snapshots/0123abcd/{name}" if repo == "org/adapter" else None
    )
    monkeypatch.setitem(sys.modules, "huggingface_hub", fake_hub)
    peft_model = Obj(peft_config={"default": Obj()})
    assert adapter_revision(peft_model, "org/adapter") == "0123abcd"
    assert adapter_revision(peft_model, "./local-adapter") is None


def test_mock_reports_both_revision_fields():
    assert MockBackend.model_info["adapter_revision"] is None
    assert MockBackend.model_info["base_revision"] is None

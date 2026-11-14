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


# ---- S10/P7: pinned revisions, also reported for a local folder ----
BASE_SHA = "ebb281ec70b05090aa6165b016eac8ec08e71b17"
ADAPTER_SHA = "51b653173b0ef8945508bd10f2ebdcaebfd3e441"


def install_fake_ml(monkeypatch, base_commit=None, adapter_commit=None):
    """Fake torch/transformers/peft: RealBackend builds without a GPU; every from_pretrained call is recorded."""
    calls = []

    class FakeModel:
        def __init__(self, commit):
            self.config = Obj(_commit_hash=commit) if commit else Obj()
            self.device = "cpu"

        def to(self, _device):
            return self

        def eval(self):
            return self

    def recorder(kind, result):
        def from_pretrained(*args, **kw):
            calls.append((kind, args[-1] if kind == "adapter" else args[0], kw))
            return result(*args)
        return from_pretrained

    torch = types.ModuleType("torch")
    torch.cuda = Obj(is_available=lambda: False)
    torch.float16, torch.float32 = "float16", "float32"
    transformers = types.ModuleType("transformers")
    transformers.AutoProcessor = Obj(from_pretrained=recorder("processor", lambda *a: Obj()))
    transformers.Qwen3VLForConditionalGeneration = Obj(from_pretrained=recorder("base", lambda *a: FakeModel(base_commit)))
    transformers.AutoModelForImageTextToText = transformers.Qwen3VLForConditionalGeneration

    def adapter(base, _repo):
        model = FakeModel(None)
        model.peft_config = {"default": Obj(_commit_hash=adapter_commit) if adapter_commit else Obj()}
        return model

    peft = types.ModuleType("peft")
    peft.PeftModel = Obj(from_pretrained=recorder("adapter", adapter))
    for name, module in (("torch", torch), ("transformers", transformers), ("peft", peft)):
        monkeypatch.setitem(sys.modules, name, module)
    fake_hub = types.ModuleType("huggingface_hub")
    fake_hub.try_to_load_from_cache = lambda repo, name: None
    monkeypatch.setitem(sys.modules, "huggingface_hub", fake_hub)
    return calls


def real_settings(base, adapter, **kw):
    from app.config import Settings

    return Settings(mode="real", hf_adapter_repo=adapter, base_model=base, hf_token=None, max_image_bytes=1, **kw)


def test_local_folders_report_the_configured_revisions_instead_of_null(monkeypatch, tmp_path):
    """PV8 (2026-11-14): loaded from local folders, both revisions were null."""
    from app.backends import RealBackend

    base_dir, adapter_dir = tmp_path / "Qwen3-VL-4B-Instruct", tmp_path / "adapter"
    base_dir.mkdir()
    adapter_dir.mkdir()
    calls = install_fake_ml(monkeypatch)
    backend = RealBackend(real_settings(str(base_dir), str(adapter_dir), base_revision=BASE_SHA, adapter_revision=ADAPTER_SHA))
    assert backend.model_info["base_revision"] == BASE_SHA
    assert backend.model_info["adapter_revision"] == ADAPTER_SHA
    assert all("revision" not in kw for _kind, _name, kw in calls)  # a local folder has no revision


def test_hub_ids_are_loaded_at_the_pinned_revisions(monkeypatch):
    from app.backends import RealBackend

    calls = install_fake_ml(monkeypatch, base_commit=BASE_SHA, adapter_commit=ADAPTER_SHA)
    backend = RealBackend(real_settings("Qwen/Qwen3-VL-4B-Instruct", "org/adapter", base_revision=BASE_SHA, adapter_revision=ADAPTER_SHA))
    revisions = {kind: kw.get("revision") for kind, _name, kw in calls}
    assert revisions == {"processor": BASE_SHA, "base": BASE_SHA, "adapter": ADAPTER_SHA}
    assert backend.model_info["base_revision"] == BASE_SHA
    assert backend.model_info["adapter_revision"] == ADAPTER_SHA


def test_revision_env_defaults_to_the_parity_pins(monkeypatch):
    from app.config import load_settings

    monkeypatch.delenv("INFERENCE_BASE_REVISION", raising=False)
    monkeypatch.delenv("INFERENCE_ADAPTER_REVISION", raising=False)
    settings = load_settings()
    assert (settings.base_revision, settings.adapter_revision) == (BASE_SHA, ADAPTER_SHA)
    monkeypatch.setenv("INFERENCE_BASE_REVISION", "main")
    monkeypatch.setenv("INFERENCE_ADAPTER_REVISION", " ")
    settings = load_settings()
    assert (settings.base_revision, settings.adapter_revision) == ("main", None)  # empty = no pin

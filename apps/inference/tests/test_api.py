import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def png(img) -> bytes:
    return cv2.imencode(".png", img)[1].tobytes()


def sharp_image(seed=0):
    rng = np.random.default_rng(seed)
    return rng.integers(60, 200, (240, 320, 3), dtype=np.uint8)  # high-frequency noise -> passes blur gate


@pytest.fixture()
def client():
    settings = Settings(mode="mock", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=1_000_000)
    with TestClient(create_app(settings)) as c:
        yield c


def post(client, data: bytes):
    return client.post("/v1/classify", files={"file": ("f.png", data, "image/png")})


def test_health_ready_in_mock(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ready" and r.json()["inference_mode"] == "mock"


def test_classified_contract_and_determinism(client):
    body = post(client, png(sharp_image())).json()
    assert body["status"] == "classified" and body["inference_mode"] == "mock"
    assert body["quality"] == {"status": "ok", "issues": []}
    res = body["result"]
    assert set(res["indicators"]) and res["label"] in {"stress", "not_stress", "undefined"}
    assert (res["confidence"] is None) == (res["label"] == "undefined")
    assert post(client, png(sharp_image())).json()["result"] == res


def test_blank_frame_is_skipped_not_not_stress(client):
    body = post(client, png(np.full((240, 320, 3), 128, np.uint8))).json()
    assert body["status"] == "skipped_quality" and body["result"] is None
    assert body["quality"]["status"] == "skipped" and "blank_or_occluded" in body["quality"]["issues"]


def test_undecodable_image_is_skipped(client):
    body = post(client, b"not an image").json()
    assert body["status"] == "skipped_quality" and body["quality"]["issues"] == ["gagal_dibaca_atau_blank"]


def test_parse_error_is_distinct_status(client, monkeypatch):
    from app import pipeline

    class Bad:
        mode, model_info = "mock", {"base_model": "m", "adapter": "a", "adapter_revision": None}

        def generate(self, _):
            return "tidak ada json"

    body = pipeline.classify_bytes(png(sharp_image()), Bad())
    assert body["status"] == "parse_error" and body["result"] is None and body["raw_response"] == "tidak ada json"


def test_rejects_empty_and_oversized(client):
    assert post(client, b"").status_code == 400
    assert post(client, b"0" * 1_000_001).status_code == 413


def test_classify_503_until_ready():
    settings = Settings(mode="real", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=10)
    with TestClient(create_app(settings)) as c:  # no HF_TOKEN -> load fails -> status "error"
        import time

        time.sleep(0.3)
        assert c.get("/health").status_code == 503
        assert c.post("/v1/classify", files={"file": ("f", b"x", "image/png")}).status_code == 503


def test_api_key_is_required_only_when_configured():
    settings = Settings(mode="mock", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=1_000_000, api_key="s3cret")
    with TestClient(create_app(settings)) as c:
        data = png(sharp_image())
        assert post(c, data).status_code == 401
        assert c.post("/v1/classify", files={"file": ("f.png", data, "image/png")}, headers={"X-API-Key": "wrong"}).status_code == 401
        assert c.post("/v1/classify", files={"file": ("f.png", data, "image/png")}, headers={"X-API-Key": "s3cret"}).status_code == 200
        assert c.get("/health").status_code == 200  # health stays open so readiness can be probed


def test_image_over_the_pixel_limit_is_413_without_decoding():
    """AUDIT R2: a small PNG of 8000x8000 px used to take minutes in the quality gate."""
    import time

    settings = Settings(mode="mock", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=50_000_000)
    big = cv2.imencode(".png", np.zeros((8000, 8000, 3), np.uint8))[1].tobytes()
    with TestClient(create_app(settings)) as c:
        started = time.perf_counter()
        r = post(c, big)
        elapsed = time.perf_counter() - started
    assert r.status_code == 413 and r.json() == {"error": "image_too_large"}
    assert elapsed < 1


class OutOfMemoryError(RuntimeError):
    """Same class name as torch.cuda.OutOfMemoryError, without importing torch."""


def flaky_client(monkeypatch, error):
    """Mock-mode app whose backend raises `error` once (holding a lock like RealBackend), then works."""
    import threading

    from app import main
    from app.backends import MockBackend

    class Flaky(MockBackend):
        def __init__(self):
            self._lock, self.failed = threading.Lock(), False

        def generate(self, img):
            with self._lock:
                if not self.failed:
                    self.failed = True
                    raise error
                return super().generate(img)

    backend = Flaky()
    monkeypatch.setattr(main, "MockBackend", lambda: backend)
    settings = Settings(mode="mock", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=1_000_000)
    return TestClient(create_app(settings)), backend


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (OutOfMemoryError("CUDA out of memory. Tried to allocate 2.00 GiB"), 503, "gpu_oom"),
        (RuntimeError("CUDA error: out of memory"), 503, "gpu_oom"),
        (RuntimeError("shape mismatch"), 500, "backend_error"),
    ],
)
def test_backend_exception_is_a_coded_json_error_and_the_next_request_works(monkeypatch, error, status, code):
    """AUDIT R12: a backend crash was a plain-text 500 the API could not tell from a contract bug."""
    client, backend = flaky_client(monkeypatch, error)
    with client as c:
        first = post(c, png(sharp_image()))
        assert first.status_code == status and first.json() == {"error": code}
        assert not backend._lock.locked()
        assert post(c, png(sharp_image())).status_code == 200


# --- H11: model load can no longer hang in `loading` or stay in `error` forever ---


def real_settings(**overrides):
    base = dict(mode="real", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=1_000_000)
    return Settings(**{**base, **overrides})


def wait_for_status(c, wanted, seconds=5.0):
    import time

    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        body = c.get("/health").json()
        if body["status"] == wanted:
            return body
        time.sleep(0.05)
    raise AssertionError(f"status never became {wanted}: {body}")


def test_system_exit_during_load_is_error_not_loading_forever(monkeypatch):
    from app import main

    def boom(_settings):
        raise SystemExit(3)

    monkeypatch.setattr(main, "RealBackend", boom)
    with TestClient(create_app(real_settings())) as c:
        body = wait_for_status(c, "error")
    assert "SystemExit" in body["detail"]


def test_health_reports_loading_since_in_utc(monkeypatch):
    import re
    import threading

    from app import main

    release = threading.Event()
    monkeypatch.setattr(main, "RealBackend", lambda _s: release.wait(5))
    with TestClient(create_app(real_settings())) as c:
        body = c.get("/health").json()
        release.set()
    assert body["status"] == "loading"
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z", body["loading_since"])


def test_load_over_the_timeout_becomes_error(monkeypatch):
    import threading

    from app import main

    release = threading.Event()
    monkeypatch.setattr(main, "RealBackend", lambda _s: release.wait(10))
    with TestClient(create_app(real_settings(load_timeout_s=1))) as c:
        body = wait_for_status(c, "error", seconds=4)
        release.set()
    assert "timed out" in body["detail"]


def test_load_error_exits_the_process_when_configured(monkeypatch):
    from app import main

    def boom(_settings):
        raise RuntimeError("no weights")

    exits = []
    monkeypatch.setattr(main, "RealBackend", boom)
    with TestClient(create_app(real_settings(exit_on_load_error=True), exit_process=exits.append)) as c:
        wait_for_status(c, "error")
    assert exits and exits[0] != 0


def test_classify_503_body_says_whether_the_model_is_loading_or_failed(monkeypatch):
    from app import main

    def boom(_settings):
        raise RuntimeError("no weights")

    monkeypatch.setattr(main, "RealBackend", boom)
    with TestClient(create_app(real_settings())) as c:
        wait_for_status(c, "error")
        r = c.post("/v1/classify", files={"file": ("f", b"x", "image/png")})
    assert r.status_code == 503 and r.json()["status"] == "error"


def test_exit_on_load_error_defaults(monkeypatch):
    from app.config import load_settings

    monkeypatch.delenv("INFERENCE_EXIT_ON_LOAD_ERROR", raising=False)
    monkeypatch.setenv("INFERENCE_MODE", "real")
    assert load_settings().exit_on_load_error is True
    assert load_settings().load_timeout_s == 1800
    monkeypatch.setenv("INFERENCE_MODE", "mock")
    assert load_settings().exit_on_load_error is False
    monkeypatch.setenv("INFERENCE_EXIT_ON_LOAD_ERROR", "maybe")
    with pytest.raises(ValueError, match="INFERENCE_EXIT_ON_LOAD_ERROR"):
        load_settings()


# --- R1: bounded queue and no model call for a client that already left ---


def test_excess_concurrent_uploads_get_queue_full_at_once(monkeypatch):
    """Audit scenario scaled down: 5 simultaneous uploads, ~11 s inference -> here 0.4 s per frame."""
    import threading
    import time

    from app import main
    from app.backends import MockBackend

    class Slow(MockBackend):
        def __init__(self):
            self._lock = threading.Lock()

        def generate(self, img):
            with self._lock:  # serialised like RealBackend
                time.sleep(0.4)
                return super().generate(img)

    monkeypatch.setattr(main, "MockBackend", Slow)
    settings = Settings(mode="mock", hf_adapter_repo="x", base_model="y", hf_token=None, max_image_bytes=1_000_000, max_queue=2)
    results = []
    with TestClient(create_app(settings)) as c:
        data = png(sharp_image())

        def upload():
            started = time.perf_counter()
            r = post(c, data)
            results.append((r.status_code, r.json(), r.headers.get("retry-after"), time.perf_counter() - started))

        threads = [threading.Thread(target=upload) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    busy = [r for r in results if r[0] == 503]
    done = [r for r in results if r[0] == 200]
    assert len(done) == 3 and len(busy) == 2  # 1 running + INFERENCE_MAX_QUEUE=2 waiting
    assert all(body == {"error": "queue_full"} and retry for _, body, retry, _ in busy)
    assert all(elapsed < 0.3 for *_, elapsed in busy)  # rejected at once, not after waiting


def test_model_is_not_called_when_the_client_left_before_generate():
    from app.backends import MockBackend
    from app.pipeline import ClientDisconnected, GuardedBackend, classify_bytes

    calls = []

    class Recording(MockBackend):
        def generate(self, img):
            calls.append(1)
            return super().generate(img)

    import threading

    import pytest as _pytest

    with _pytest.raises(ClientDisconnected):
        classify_bytes(png(sharp_image()), GuardedBackend(Recording(), threading.Lock(), lambda: True))
    assert calls == []
    classify_bytes(png(sharp_image()), GuardedBackend(Recording(), threading.Lock(), lambda: False))
    assert calls == [1]


def test_max_queue_env(monkeypatch):
    from app.config import load_settings

    monkeypatch.delenv("INFERENCE_MAX_QUEUE", raising=False)
    assert load_settings().max_queue == 2
    monkeypatch.setenv("INFERENCE_MAX_QUEUE", "0")
    assert load_settings().max_queue == 0  # 0 = only the running request, nothing waits
    monkeypatch.setenv("INFERENCE_MAX_QUEUE", "-1")
    with pytest.raises(ValueError, match="INFERENCE_MAX_QUEUE"):
        load_settings()

import hmac
import logging
import os
import threading
from collections.abc import Callable
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import anyio
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from .backends import Backend, MockBackend, RealBackend
from .config import Settings, load_settings
from .pipeline import BackendFailure, ClientDisconnected, GuardedBackend, classify_bytes
from .quality import image_pixels

logger = logging.getLogger(__name__)

# Seconds a caller should wait after 503 queue_full (AUDIT R1): about one inference on a T4.
QUEUE_RETRY_AFTER_S = 15


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class State:
    """Honest readiness: `ready` only after the model is fully loaded.

    A load can no longer hang in `loading` or die silently (AUDIT H11): any BaseException becomes
    `error`, a load that exceeds `load_timeout_s` becomes `error`, and with `exit_on_load_error` the
    process exits non-zero so the orchestrator restarts it.
    """

    def __init__(self, settings: Settings, exit_process: Callable[[int], object] = os._exit) -> None:
        self.settings = settings
        self.status = "loading"
        self.detail: str | None = None
        self.backend: Backend | None = None
        self.loading_since: str | None = None
        self._exit_process = exit_process
        self._guard = threading.Lock()
        self.model_lock = threading.Lock()  # one generate at a time (R1)
        self._admitted = 0

    def try_admit(self) -> bool:
        """Admit one running request plus `max_queue` waiting ones; refuse the rest at once (R1)."""
        with self._guard:
            if self._admitted > self.settings.max_queue:
                return False
            self._admitted += 1
            return True

    def release(self) -> None:
        with self._guard:
            self._admitted -= 1

    def load(self) -> None:
        self.loading_since = _utc_now()
        try:
            backend = MockBackend() if self.settings.mode == "mock" else RealBackend(self.settings)
        except BaseException as exc:  # noqa: BLE001 - SystemExit/KeyboardInterrupt must not leave `loading`
            self._fail(f"{type(exc).__name__}: {exc}")
            return
        with self._guard:
            if self.status != "loading":  # timed out meanwhile: stay `error`
                return
            self.backend, self.status, self.loading_since = backend, "ready", None

    def start_watchdog(self) -> None:
        timer = threading.Timer(self.settings.load_timeout_s, self._timed_out)
        timer.daemon = True
        timer.start()

    def _timed_out(self) -> None:
        if self.status == "loading":
            self._fail(f"model load timed out after {self.settings.load_timeout_s} s")

    def _fail(self, detail: str) -> None:
        with self._guard:
            if self.status != "loading":
                return
            self.status, self.detail = "error", detail
        logger.error("model load failed: %s", detail)
        if self.settings.exit_on_load_error:
            logger.error("exiting so the orchestrator restarts the service (INFERENCE_EXIT_ON_LOAD_ERROR)")
            self._exit_process(3)


def create_app(settings: Settings | None = None, exit_process: Callable[[int], object] = os._exit) -> FastAPI:
    state = State(settings or load_settings(), exit_process)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if state.settings.mode == "mock" or os.environ.get("INFERENCE_LOAD_BLOCKING") == "1":
            state.load()
        else:  # model loading takes minutes; serve /health (503) meanwhile
            state.start_watchdog()
            threading.Thread(target=state.load, daemon=True).start()
        yield

    app = FastAPI(title="AgroNova inference", lifespan=lifespan)

    @app.get("/health")
    def health():
        body = {
            "status": state.status,
            "inference_mode": state.settings.mode,
            "detail": state.detail,
            "loading_since": state.loading_since,
        }
        return JSONResponse(body, status_code=200 if state.status == "ready" else 503)

    @app.post("/v1/classify")
    async def classify(request: Request, file: UploadFile = File(...), x_api_key: str | None = Header(default=None)):
        # Optional shared secret, for when the service is reachable through a public tunnel.
        expected = state.settings.api_key
        if expected and not hmac.compare_digest(x_api_key or "", expected):
            raise HTTPException(status_code=401, detail="invalid or missing API key")
        if state.status != "ready" or state.backend is None:
            # `status` lets the API tell a model still loading from one that failed (H11).
            return JSONResponse({"error": "model_not_ready", "status": state.status}, status_code=503)
        data = await file.read(state.settings.max_image_bytes + 1)
        if not data:
            raise HTTPException(status_code=400, detail="empty file")
        if len(data) > state.settings.max_image_bytes:
            raise HTTPException(status_code=413, detail="image too large")
        pixels = image_pixels(data)  # header only: an 8000x8000 PNG is rejected before decoding (R2)
        if pixels is not None and pixels > state.settings.max_image_pixels:
            return JSONResponse({"error": "image_too_large"}, status_code=413)
        if not state.try_admit():
            return JSONResponse(
                {"error": "queue_full"}, status_code=503, headers={"Retry-After": str(QUEUE_RETRY_AFTER_S)}
            )
        backend = GuardedBackend(
            state.backend, state.model_lock, lambda: anyio.from_thread.run(request.is_disconnected)
        )
        try:
            return await run_in_threadpool(classify_bytes, data, backend, max_side=state.settings.max_image_side)
        except BackendFailure as failure:  # generic body; the traceback is in the log (R12)
            return JSONResponse({"error": failure.code}, status_code=failure.http_status)
        except ClientDisconnected:
            logger.info("client disconnected before the model ran; skipped generate")
            return Response(status_code=499)
        finally:
            state.release()

    return app


app = create_app()

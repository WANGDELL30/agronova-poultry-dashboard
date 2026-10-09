import hmac
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .backends import Backend, MockBackend, RealBackend
from .config import Settings, load_settings
from .pipeline import classify_bytes


class State:
    """Honest readiness: `ready` only after the model is fully loaded."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.status = "loading"
        self.detail: str | None = None
        self.backend: Backend | None = None

    def load(self) -> None:
        try:
            self.backend = MockBackend() if self.settings.mode == "mock" else RealBackend(self.settings)
            self.status = "ready"
        except Exception as exc:  # noqa: BLE001
            self.status, self.detail = "error", f"{type(exc).__name__}: {exc}"


def create_app(settings: Settings | None = None) -> FastAPI:
    state = State(settings or load_settings())

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if state.settings.mode == "mock" or os.environ.get("INFERENCE_LOAD_BLOCKING") == "1":
            state.load()
        else:  # model loading takes minutes; serve /health (503) meanwhile
            threading.Thread(target=state.load, daemon=True).start()
        yield

    app = FastAPI(title="AgroNova inference", lifespan=lifespan)

    @app.get("/health")
    def health():
        body = {"status": state.status, "inference_mode": state.settings.mode, "detail": state.detail}
        return JSONResponse(body, status_code=200 if state.status == "ready" else 503)

    @app.post("/v1/classify")
    def classify(file: UploadFile = File(...), x_api_key: str | None = Header(default=None)):
        # Optional shared secret, for when the service is reachable through a public tunnel.
        expected = state.settings.api_key
        if expected and not hmac.compare_digest(x_api_key or "", expected):
            raise HTTPException(status_code=401, detail="invalid or missing API key")
        if state.status != "ready" or state.backend is None:
            raise HTTPException(status_code=503, detail=f"model {state.status}")
        data = file.file.read(state.settings.max_image_bytes + 1)
        if not data:
            raise HTTPException(status_code=400, detail="empty file")
        if len(data) > state.settings.max_image_bytes:
            raise HTTPException(status_code=413, detail="image too large")
        return classify_bytes(data, state.backend)

    return app


app = create_app()

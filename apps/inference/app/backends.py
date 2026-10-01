"""VLM backends. Both return the raw text a VLM would produce, so the parsing/rule path is shared."""
import hashlib
import json
import threading
from typing import Protocol

import numpy as np

from .config import Settings
from .scs import SCS_INDICATORS, SCS_SYSTEM_PROMPT, SCS_USER_PROMPT


class Backend(Protocol):
    mode: str
    model_info: dict

    def generate(self, img_bgr: np.ndarray) -> str: ...


class MockBackend:
    """Deterministic fake VLM (no GPU). Output depends only on the image bytes."""

    mode = "mock"
    model_info = {"base_model": "mock", "adapter": "mock", "adapter_revision": None}

    def generate(self, img_bgr: np.ndarray) -> str:
        digest = hashlib.sha256(img_bgr.tobytes()).digest()
        options = ["YA", "TIDAK", "TIDAK", "TIDAK_TERLIHAT"]
        answers = {ind["key"]: options[digest[i] % len(options)] for i, ind in enumerate(SCS_INDICATORS)}
        return json.dumps({"indicators": answers, "label": "mock"})


class RealBackend:
    """Qwen3-VL + LoRA. Loading logic ported from notebook 04 (cells 8-9)."""

    mode = "real"

    def __init__(self, settings: Settings) -> None:
        import torch  # noqa: PLC0415 - heavy import only in real mode
        from huggingface_hub import HfApi
        from peft import PeftModel
        from transformers import AutoProcessor

        if not settings.hf_token:
            raise RuntimeError("HF_TOKEN is required in real mode (adapter repo is private).")
        self._torch = torch
        self._lock = threading.Lock()
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        self._processor = AutoProcessor.from_pretrained(
            settings.base_model, min_pixels=256 * 28 * 28, max_pixels=512 * 28 * 28
        )
        base = self._load_base(settings.base_model, dtype).to(device)
        base.eval()
        self._model = PeftModel.from_pretrained(base, settings.hf_adapter_repo, token=settings.hf_token)
        self._model.eval()
        try:
            revision = HfApi().model_info(settings.hf_adapter_repo, token=settings.hf_token).sha
        except Exception:  # noqa: BLE001 - revision is informational only
            revision = None
        self.model_info = {
            "base_model": settings.base_model,
            "adapter": settings.hf_adapter_repo,
            "adapter_revision": revision,
        }

    @staticmethod
    def _load_base(model_name: str, dtype):
        errors = []
        if "qwen3-vl" in model_name.lower() or "qwen3_vl" in model_name.lower():
            try:
                from transformers import Qwen3VLForConditionalGeneration

                return Qwen3VLForConditionalGeneration.from_pretrained(model_name, dtype=dtype, low_cpu_mem_usage=True)
            except Exception as e:  # noqa: BLE001
                errors.append(str(e))
        try:
            from transformers import AutoModelForImageTextToText

            return AutoModelForImageTextToText.from_pretrained(model_name, dtype=dtype, low_cpu_mem_usage=True)
        except Exception as e:  # noqa: BLE001
            errors.append(str(e))
        raise ImportError("Failed to load VLM:\n" + "\n".join(errors))

    def generate(self, img_bgr: np.ndarray, max_new_tokens: int = 400) -> str:
        import cv2
        from PIL import Image

        image = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
        messages = [
            {"role": "system", "content": SCS_SYSTEM_PROMPT},
            {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": SCS_USER_PROMPT}]},
        ]
        chat_text = self._processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        with self._lock:  # one generation at a time on the GPU
            inputs = self._processor(text=[chat_text], images=[image], return_tensors="pt").to(self._model.device)
            with self._torch.no_grad():
                output_ids = self._model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
            trimmed = output_ids[:, inputs["input_ids"].shape[1] :]
            return self._processor.batch_decode(trimmed, skip_special_tokens=True)[0]

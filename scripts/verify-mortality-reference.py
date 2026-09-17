"""Generate numerical reference cases using the original H5 and Keras's NumPy backend.

These synthetic tensors are conversion tests, not poultry observations or accuracy tests.
Requires keras==3.13.2 numpy==2.2.6 scipy==1.15.3 h5py==3.14.0 jax==0.4.38 jaxlib==0.4.38.
"""
import os
from pathlib import Path
import json

os.environ["KERAS_BACKEND"] = "numpy"
os.environ["KERAS_HOME"] = str(Path(__file__).resolve().parents[1] / ".local/keras-home")

import keras
import numpy as np

root = Path(__file__).resolve().parents[1]
model = keras.models.load_model(root / "packages/mortality-model/artifacts/model_mortalitas_lstm.h5", compile=False, safe_mode=True)
cases = {
    "zeros": np.zeros((24, 9), dtype=np.float32),
    "ones": np.ones((24, 9), dtype=np.float32),
    "ramp": np.linspace(-1, 1, 216, dtype=np.float32).reshape(24, 9),
    "alternating": np.array([(-1) ** i * (i % 7) / 7 for i in range(216)], dtype=np.float32).reshape(24, 9),
    "impulse": np.eye(24, 9, dtype=np.float32),
}
output = {
    "reference": "Keras 3.13.2, NumPy backend, original H5, training=False",
    "cases": [{"name": name, "sequence": sequence.tolist(), "scores": np.array(model(sequence[None, ...], training=False))[0].tolist()} for name, sequence in cases.items()],
}
destination = root / "packages/mortality-model/src/reference-fixtures.json"
destination.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
print(json.dumps({case["name"]: case["scores"] for case in output["cases"]}, indent=2))

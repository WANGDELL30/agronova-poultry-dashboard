"""Export this audited Keras LSTM to TF.js without deserializing executable objects.

Usage: python scripts/export-mortality-model.py path/to/model_mortalitas_lstm.h5
Requires h5py==3.14.0 and numpy==2.2.6. The source remains unchanged.
"""

import base64
import hashlib
import json
from pathlib import Path
import sys

import h5py
import numpy as np


source = Path(sys.argv[1])
destination = Path(__file__).resolve().parents[1] / "packages/mortality-model"
with h5py.File(source, "r") as model:
    config = json.loads(model.attrs["model_config"])
    layers = config["config"]["layers"]
    assert config["class_name"] == "Sequential"
    assert [layer["class_name"] for layer in layers] == [
        "InputLayer", "LSTM", "Dropout", "LSTM", "Dropout", "Dense", "Dense"
    ], "Only the inspected architecture is supported."
    assert layers[0]["config"]["batch_shape"] == [None, 24, 9]
    topology_layers = []
    specs = []
    buffers = []
    for layer in layers:
        kind, cfg = layer["class_name"], layer["config"]
        name = cfg["name"]
        if kind == "InputLayer":
            converted = {"name": name, "batch_input_shape": [None, 24, 9], "dtype": "float32"}
        elif kind == "Dropout":
            converted = {"name": name, "rate": cfg["rate"]}
        else:
            converted = {key: cfg[key] for key in ["name", "units", "activation", "use_bias"]}
            assert cfg["use_bias"] is True
            if kind == "LSTM":
                assert cfg["activation"] == "tanh" and cfg["recurrent_activation"] == "sigmoid"
                assert not any(cfg[key] for key in ["stateful", "go_backwards", "return_state", "dropout", "recurrent_dropout"])
                converted.update({key: cfg[key] for key in ["return_sequences", "recurrent_activation", "unit_forget_bias"]})
                keys = ["kernel", "recurrent_kernel", "bias"]
                prefix = f"model_weights/{name}/sequential/{name}/lstm_cell"
            else:
                keys = ["kernel", "bias"]
                prefix = f"model_weights/{name}/sequential/{name}"
            for key in keys:
                value = np.asarray(model[f"{prefix}/{key}"], dtype="<f4")
                assert np.isfinite(value).all()
                specs.append({"name": f"{name}/{key}", "shape": list(value.shape), "dtype": "float32"})
                buffers.append(value.tobytes())
        topology_layers.append({"class_name": kind, "config": converted})
    assert [layers[i]["config"]["units"] for i in [1, 3, 5, 6]] == [64, 32, 16, 3]
    assert layers[1]["config"]["return_sequences"] and not layers[3]["config"]["return_sequences"]
    assert layers[5]["config"]["activation"] == "relu" and layers[6]["config"]["activation"] == "softmax"
    weights = b"".join(buffers)
    artifact = {
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "weights_sha256": hashlib.sha256(weights).hexdigest(),
        "keras_version": str(model.attrs["keras_version"]),
        "modelTopology": {"class_name": "Sequential", "config": {"name": "mortality_lstm", "layers": topology_layers}},
        "weightSpecs": specs,
        "weightDataBase64": base64.b64encode(weights).decode("ascii"),
    }
    (destination / "src").mkdir(parents=True, exist_ok=True)
    (destination / "src/model-artifact.json").write_text(json.dumps(artifact, separators=(",", ":")) + "\n", encoding="utf-8")
    (destination / "artifacts").mkdir(exist_ok=True)
    (destination / "artifacts/model_mortalitas_lstm.h5").write_bytes(source.read_bytes())
    print(json.dumps({key: artifact[key] for key in ["source_sha256", "weights_sha256", "keras_version"]}, indent=2))
    print(f"Exported {len(weights)} weight bytes; optimizer state excluded.")

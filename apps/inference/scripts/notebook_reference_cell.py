# PASTE as a NEW cell at the END of notebook 04 (after cell 11, same Kaggle session/kernel).
# Produces the reference results that parity_check.py compares against. Uses ONLY notebook logic.
import json, os

PARITY_IMAGE_DIR = os.path.join(DEST, "test")  # same folder as the demo cell; change if needed
PARITY_LIMIT = 20

files = sorted(f for f in os.listdir(PARITY_IMAGE_DIR) if f.lower().endswith((".jpg", ".jpeg", ".png")))[:PARITY_LIMIT]
reference = []
for name in files:
    frame, quality_status = image_quality_gate(os.path.join(PARITY_IMAGE_DIR, name), camera_id="parity", kandang_id="parity")
    entry = {"file": name, "quality_status": quality_status, "result": None}
    if frame is not None:
        entry["result"] = classify_image_with_vlm(frame)  # indicators/total_ya/visible_count/label/score_stress/...
    reference.append(entry)

with open("/kaggle/working/notebook_reference.json", "w") as fh:
    json.dump({"image_dir": PARITY_IMAGE_DIR, "items": reference}, fh, indent=2, default=str)
print(f"saved {len(reference)} reference items -> /kaggle/working/notebook_reference.json")

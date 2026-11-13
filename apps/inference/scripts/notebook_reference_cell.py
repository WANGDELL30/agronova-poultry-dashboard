# PASTE as a NEW cell at the END of notebook 04 (after cell 11, same Kaggle session/kernel).
# Produces the reference results that parity_check.py compares against. Uses ONLY notebook logic.
import json, os

# AUDIT P4: DEST/test holds only 2 images, both `ok`. Point PARITY_IMAGE_DIR at a folder that covers
# every quality-gate path and includes chicken crops (see README §A for the minimum per path).
PARITY_IMAGE_DIR = os.path.join(DEST, "test")  # change to your parity image folder
PARITY_LIMIT = 200
MIN_IMAGES_PER_PATH = {"ok": 5, "enhanced": 3, "skipped": 2}  # same as scripts/parity_check.py

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
for path, minimum in MIN_IMAGES_PER_PATH.items():
    count = sum(1 for entry in reference if entry["quality_status"] == path)
    if count < minimum:
        print(f"WARNING: {count} '{path}' image(s), below the minimum of {minimum}; add more before trusting N/N identical")

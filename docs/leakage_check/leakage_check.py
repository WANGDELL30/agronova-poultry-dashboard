"""Cek leakage lintas split (read-only) untuk dataset Chicken Stress v19.

Tidak mengubah data, label, atau split. Hanya membaca:
  - citra mentah + _annotations.coco.json hasil ekstraksi zip Roboflow (--raw)
  - folder kerja notebook: session_id_mapping.csv, label_balancing_log.csv,
    dataset/{train,valid,test}/<kelas>/*.jpg (--work)
  - indicators_ground_truth_multi.csv (--gt)
dan menulis leakage_details.csv + leakage_summary.json ke --out.

Split final per citra tidak disimpan notebook sebagai tabel, jadi direkonstruksi dengan
mencocokkan tiap file crop di dataset/ ke crop box representatif tiap instance
(ukuran + kelas folder + selisih piksel terkecil).

Contoh (dari root repo):
  python -I docs/leakage_check/leakage_check.py \
    --raw "_tmp_raw/Data" \
    --work "../executed-final-Manual Annotation Workflow/Executed/results/Data_working" \
    --gt "../executed-final-Manual Annotation Workflow/Manual Annotation - For Training/indicators_ground_truth_multi.csv" \
    --out "docs/leakage_check"
"""

import argparse
import collections
import csv
import itertools
import json
import os
import re
import sys
from datetime import datetime

import imagehash
import numpy as np
from PIL import Image

SPLITS = ["train", "valid", "test"]
TIME_GAP_SEC = 120          # sama dengan SESSION_TIME_GAP_SEC di notebook
BASE_THRESHOLD = 10         # sama dengan SESSION_PHASH_THRESHOLD di notebook
SENSITIVITY = [8, 10, 12]
OVERLAP_THRESHOLD_INSTANCE = 0.5
TS_PATTERN = re.compile(r"IMG_(\d{8})_(\d{6})")


def load_boxes(raw_dir):
    boxes, images = [], {}
    for sp in SPLITS:
        with open(os.path.join(raw_dir, sp, "_annotations.coco.json"), encoding="utf-8") as f:
            d = json.load(f)
        cats = {c["id"]: c["name"] for c in d["categories"]}
        id2fn = {i["id"]: i["file_name"] for i in d["images"]}
        for fn in id2fn.values():
            images[fn] = os.path.join(raw_dir, sp, fn)
        for a in d["annotations"]:
            x, y, w, h = a["bbox"]
            boxes.append(dict(sp=sp, fn=id2fn[a["image_id"]], cat=cats[a["category_id"]],
                              x=x, y=y, w=w, h=h, area=w * h, key=None))
    return boxes, images


def assign_instance_keys(boxes):
    """Sama dengan assign_instance_keys() di notebook: urut area menurun, gabung bila
    kategori sama dan overlap terhadap box kecil > 0.5."""
    def overlap(s, b):
        iw = max(0, min(s["x"] + s["w"], b["x"] + b["w"]) - max(s["x"], b["x"]))
        ih = max(0, min(s["y"] + s["h"], b["y"] + b["h"]) - max(s["y"], b["y"]))
        return iw * ih / max(1e-6, s["w"] * s["h"])

    groups = collections.defaultdict(list)
    for b in boxes:
        groups[(b["sp"], b["fn"])].append(b)
    for (sp, fn), g in groups.items():
        g = sorted(g, key=lambda b: -b["area"])
        n = 0
        for i, a in enumerate(g):
            if a["key"]:
                continue
            a["key"] = f"{sp}/{fn}#inst{n}"
            for b in g[i + 1:]:
                if not b["key"] and b["cat"] == a["cat"] and overlap(b, a) > OVERLAP_THRESHOLD_INSTANCE:
                    b["key"] = a["key"]
            n += 1
    inst = collections.defaultdict(list)
    for b in boxes:
        inst[b["key"]].append(b)
    return {k: max(v, key=lambda b: b["area"]) for k, v in inst.items()}


def build_sessions(files, hashes, timestamps, threshold):
    """Sama dengan cell deteksi sesi di notebook: Union-Find atas pasangan dengan
    jarak pHash <= threshold ATAU selisih timestamp nama file <= 120 detik."""
    parent = {f: f for f in files}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for f1, f2 in itertools.combinations(files, 2):
        merged = (hashes[f1] - hashes[f2]) <= threshold
        if not merged and f1 in timestamps and f2 in timestamps:
            merged = abs((timestamps[f1] - timestamps[f2]).total_seconds()) <= TIME_GAP_SEC
        if merged:
            ra, rb = find(f1), find(f2)
            if ra != rb:
                parent[ra] = rb
    roots = sorted({find(f) for f in files})
    rid = {r: f"session_{i + 1:04d}" for i, r in enumerate(roots)}
    return {f: rid[find(f)] for f in files}


def reconstruct_split(rep, gt_keys, images, work_dir, session_of, session_bin):
    """Cocokkan setiap crop non-augmentasi di dataset/ ke satu instance."""
    def src(sp, fn):
        p = os.path.join(work_dir, sp, fn)  # salinan kerja yang di-crop notebook
        return p if os.path.exists(p) else images[fn]

    cand = {}
    for k in gt_keys:
        b = rep[k]
        x, y, w, h = int(b["x"]), int(b["y"]), int(b["w"]), int(b["h"])
        im = Image.open(src(b["sp"], b["fn"])).convert("RGB").crop((x, y, x + w, y + h))
        cand[k] = (np.asarray(im, dtype=np.float32), session_bin[session_of[b["fn"]]])

    crop_to_inst, inst_split, aug_files, problems = {}, {}, [], []
    for sp in SPLITS:
        for cls in sorted(os.listdir(os.path.join(work_dir, "dataset", sp))):
            folder = os.path.join(work_dir, "dataset", sp, cls)
            for f in sorted(os.listdir(folder)):
                rel = f"{sp}/{cls}/{f}"
                if f.startswith("aug_"):
                    aug_files.append(rel)
                    continue
                a = np.asarray(Image.open(os.path.join(folder, f)).convert("RGB"), dtype=np.float32)
                scored = sorted((float(np.abs(a - c).mean()), k)
                                for k, (c, bc) in cand.items() if c.shape == a.shape and bc == cls)
                if not scored:
                    problems.append(f"crop tanpa pasangan instance: {rel}")
                    continue
                k = scored[0][1]
                if k in inst_split:
                    problems.append(f"instance {k} cocok dengan >1 crop: {rel}")
                crop_to_inst[rel] = k
                inst_split[k] = sp
    missing = [k for k in gt_keys if k not in inst_split]
    problems += [f"instance tanpa crop: {k}" for k in missing]
    return crop_to_inst, inst_split, aug_files, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--gt", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

    boxes, images = load_boxes(args.raw)
    rep = assign_instance_keys(boxes)
    with open(args.gt, encoding="utf-8") as f:
        gt = list(csv.DictReader(f))
    gt_keys = [r["instance_key"] for r in gt]
    with open(os.path.join(args.work, "session_id_mapping.csv"), encoding="utf-8") as f:
        session_saved = {r["file_name"]: r["session_id"] for r in csv.DictReader(f)}
    with open(os.path.join(args.work, "label_balancing_log.csv"), encoding="utf-8") as f:
        session_bin = {r["session_id"]: r["label_biner"] for r in csv.DictReader(f)}

    # --- Langkah 1: pemetaan nama file ---
    files = sorted(images)
    map_check = {
        "citra_di_zip": len(images),
        "citra_di_session_mapping": len(session_saved),
        "zip_tanpa_session": sorted(set(images) - set(session_saved)),
        "session_tanpa_zip": sorted(set(session_saved) - set(images)),
        "instance_gt": len(gt_keys),
        "instance_gt_tidak_ada_di_coco": [k for k in gt_keys if k not in rep],
        "citra_gt": len({rep[k]["fn"] for k in gt_keys if k in rep}),
    }

    # --- pHash dari citra mentah (Image.open tanpa konversi, seperti di notebook) ---
    hashes = {fn: imagehash.phash(Image.open(images[fn])) for fn in files}
    timestamps = {}
    for fn in files:
        m = TS_PATTERN.search(fn)
        if m:
            timestamps[fn] = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")

    # Bandingkan sesi dari citra mentah dengan sesi tersimpan (sebagai partisi, bukan nama)
    def partition(mapping):
        g = collections.defaultdict(set)
        for f, s in mapping.items():
            g[s].add(f)
        return {frozenset(v) for v in g.values()}

    sessions_raw = {t: build_sessions(files, hashes, timestamps, t) for t in SENSITIVITY}
    same_partition = partition(sessions_raw[BASE_THRESHOLD]) == partition(session_saved)

    # --- Split final per crop/instance/citra ---
    crop_to_inst, inst_split, aug_files, problems = reconstruct_split(
        rep, gt_keys, images, args.work, session_saved, session_bin)
    image_splits = collections.defaultdict(set)
    for k, sp in inst_split.items():
        image_splits[rep[k]["fn"]].add(sp)

    details = []

    # a. sesi (tersimpan) di >1 split
    sess_splits = collections.defaultdict(set)
    for fn, sps in image_splits.items():
        sess_splits[session_saved[fn]] |= sps
    viol_a = {s: v for s, v in sess_splits.items() if len(v) > 1}
    for s, v in sorted(viol_a.items()):
        details.append(dict(cek="a_sesi_lintas_split", item_1=s, item_2="", split_1="|".join(sorted(v)),
                            split_2="", jarak_phash="", keterangan="id_sesi tersimpan muncul di >1 split"))

    # b. citra sumber (semua crop turunannya) di >1 split
    viol_b = {fn: v for fn, v in image_splits.items() if len(v) > 1}
    for fn, v in sorted(viol_b.items()):
        details.append(dict(cek="b_citra_lintas_split", item_1=fn, item_2="", split_1="|".join(sorted(v)),
                            split_2="", jarak_phash="", keterangan="crop dari citra yang sama di >1 split"))

    # c. near-duplicate lintas split (pHash <= 10)
    img_split = {fn: next(iter(v)) for fn, v in image_splits.items() if len(v) == 1}
    pairs_all, viol_c = [], []
    for f1, f2 in itertools.combinations(files, 2):
        d = hashes[f1] - hashes[f2]
        if d <= max(SENSITIVITY):
            pairs_all.append((f1, f2, d))
        if d <= BASE_THRESHOLD and f1 in img_split and f2 in img_split and img_split[f1] != img_split[f2]:
            viol_c.append((f1, f2, d))
            details.append(dict(cek="c_near_duplicate_lintas_split", item_1=f1, item_2=f2,
                                split_1=img_split[f1], split_2=img_split[f2], jarak_phash=d,
                                keterangan="pHash <= 10 di split berbeda"))
    n_pairs_10 = sum(1 for p in pairs_all if p[2] <= BASE_THRESHOLD)

    # d. augmentasi hanya di train dan sumbernya di train
    viol_d = []
    for rel in aug_files:
        sp, cls, f = rel.split("/")
        m = re.match(r"aug_\d+_(.+)$", f)
        src_rel = f"{sp}/{cls}/{m.group(1)}" if m else None
        src_inst = crop_to_inst.get(src_rel)
        src_split = inst_split.get(src_inst)
        reasons = []
        if sp != "train":
            reasons.append("file augmentasi di luar train")
        if src_inst is None:
            reasons.append("crop sumber tidak ditemukan")
        elif src_split != "train":
            reasons.append(f"crop sumber di {src_split}")
        else:
            # citra sumber dari crop itu juga harus seluruhnya di train
            if image_splits[rep[src_inst]["fn"]] != {"train"}:
                reasons.append("citra sumber juga punya crop di luar train")
        if reasons:
            viol_d.append(rel)
            details.append(dict(cek="d_augmentasi", item_1=rel, item_2=src_rel or "", split_1=sp,
                                split_2=src_split or "", jarak_phash="", keterangan="; ".join(reasons)))
    aug_sources = []
    for rel in aug_files:
        sp, cls, f = rel.split("/")
        m = re.match(r"aug_\d+_(.+)$", f)
        src_rel = f"{sp}/{cls}/{m.group(1)}" if m else None
        k = crop_to_inst.get(src_rel) if src_rel else None
        aug_sources.append(dict(aug=rel, crop_sumber=src_rel, instance=k,
                                citra=rep[k]["fn"] if k else None, split=inst_split.get(k)))

    # --- Langkah 3: sensitivitas, split asli dipertahankan ---
    sens = []
    for t in SENSITIVITY:
        smap = sessions_raw[t]
        ss = collections.defaultdict(set)
        for fn, sps in image_splits.items():
            ss[smap[fn]] |= sps
        cross = {s: v for s, v in ss.items() if len(v) > 1}
        sizes = collections.Counter(smap.values())
        sens.append(dict(threshold=t, jumlah_sesi=len(sizes),
                         sesi_multi_citra=sum(1 for c in sizes.values() if c > 1),
                         sesi_lintas_split=len(cross),
                         sama_dengan_sesi_tersimpan=partition(smap) == partition(session_saved)))
        for s, v in sorted(cross.items()):
            members = sorted(f for f, x in smap.items() if x == s)
            details.append(dict(cek=f"sensitivitas_phash_{t}", item_1=s, item_2=" | ".join(
                f"{f}({img_split.get(f, '?')})" for f in members), split_1="|".join(sorted(v)), split_2="",
                jarak_phash="", keterangan=f"sesi hasil ambang {t} jatuh lintas split"))

    # --- jumlah sampel per split ---
    per_split = {}
    for sp in SPLITS:
        ks = [k for k, x in inst_split.items() if x == sp]
        per_split[sp] = dict(
            instance=len(ks),
            citra=len({rep[k]["fn"] for k in ks}),
            sesi=len({session_saved[rep[k]["fn"]] for k in ks}),
            label=dict(collections.Counter(r["label_final"] for r in gt if inst_split.get(r["instance_key"]) == sp)),
            crop_augmentasi=sum(1 for a in aug_files if a.startswith(sp + "/")),
        )

    summary = dict(
        pemetaan=map_check,
        rekonstruksi_split=dict(crop_dicocokkan=len(crop_to_inst), file_augmentasi=len(aug_files), masalah=problems),
        sesi_mentah_sama_dengan_tersimpan=same_partition,
        cek_a=dict(pelanggaran=len(viol_a), jumlah_sesi=len(set(session_saved.values()))),
        cek_b=dict(pelanggaran=len(viol_b), citra_dengan_crop=len(image_splits),
                   citra_multi_crop=sum(1 for fn in image_splits
                                        if sum(1 for k in inst_split if rep[k]["fn"] == fn) > 1)),
        cek_c=dict(pelanggaran=len(viol_c), pasangan_phash_le_10=n_pairs_10,
                   pasangan_phash_le_10_satu_split=n_pairs_10 - len(viol_c)),
        cek_d=dict(pelanggaran=len(viol_d), file_augmentasi=len(aug_files), sumber=aug_sources),
        sensitivitas=sens,
        per_split=per_split,
        selisih_timestamp_terkecil_lintas_split_detik=min(
            ((abs((timestamps[a] - timestamps[b]).total_seconds()), a, b, img_split[a], img_split[b])
             for a, b in itertools.combinations(img_split, 2)
             if img_split[a] != img_split[b] and a in timestamps and b in timestamps),
            default=None),
        jarak_phash_terkecil_lintas_split=min(
            ((hashes[a] - hashes[b], a, b, img_split[a], img_split[b])
             for a, b in itertools.combinations(img_split, 2) if img_split[a] != img_split[b]),
            default=None),
    )

    os.makedirs(args.out, exist_ok=True)
    fields = ["cek", "item_1", "item_2", "split_1", "split_2", "jarak_phash", "keterangan"]
    with open(os.path.join(args.out, "leakage_details.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(details)
    with open(os.path.join(args.out, "leakage_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2, default=str)
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()

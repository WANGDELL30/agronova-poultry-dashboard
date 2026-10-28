"""Ukur waktu inference VLM (Qwen3-VL-4B-Instruct + LoRA) pada 8 crop test (KPI 6).

Hanya inference, tidak ada pelatihan. Pengaturan disalin dari evaluasi yang menghasilkan
results/vlm/evaluation/Fine-tuned_VLM_SCS_prompt_LoRA/predictions.csv
(training/vlm-workflow/chickenstress-kaggle.ipynb, sel 61-70):
  - processor: min_pixels=256*28*28, max_pixels=512*28*28
  - dtype float16 di CUDA, tanpa kuantisasi; Qwen3VLForConditionalGeneration
  - generate(max_new_tokens=400, do_sample=False) -> greedy
  - citra: PIL Image.open(path).convert("RGB"), tanpa quality gate
  - system prompt: _meta.system_prompt di results/vlm/vlm_experiments.json

Token Hugging Face dibaca dari Colab Secrets (HF_TOKEN), variabel lingkungan HF_TOKEN,
atau getpass. Token tidak pernah ditulis ke berkas.

Contoh (Colab):
  python docs/kpi6/inference_time/measure_inference_time.py \
      --data data/working/dataset --manifest docs/manifest/manifest_instance.csv \
      --out /content/inference_time
"""
import argparse
import csv
import datetime as dt
import getpass
import hashlib
import json
import os
import platform
import re
import statistics
import sys
import time

BASE_MODEL = "Qwen/Qwen3-VL-4B-Instruct"
# commitHash dari results/vlm/huggingface_repos.json
BASE_REVISION = "ebb281ec70b05090aa6165b016eac8ec08e71b17"
ADAPTER_REPO = "Arga23/chickenstress-vlm-lora"
MIN_PIXELS = 256 * 28 * 28
MAX_PIXELS = 512 * 28 * 28
MAX_NEW_TOKENS = 400
DO_SAMPLE = False

# --- SCS: identik dengan chickenstress-kaggle.ipynb (sel 45-46, 63) dan vlm_experiments.json ---
SCS_INDICATORS = [
    {"key": "posisi_ekor", "name": "Posisi Ekor", "question": "Apakah ekor ayam menurun atau terkulai?",
     "stres": "Ekor terlihat menurun atau terkulai.", "tidak_stres": "Ekor tegak / posisi normal."},
    {"key": "posisi_kepala", "name": "Posisi Kepala", "question": "Apakah kepala ayam tertunduk atau ditarik ke dalam?",
     "stres": "Kepala terlihat ditarik ke dalam / menunduk.", "tidak_stres": "Kepala tegak, posisi normal."},
    {"key": "penutupan_mata", "name": "Penutupan Mata", "question": "Apakah mata ayam tertutup sebagian atau seluruhnya?",
     "stres": "Mata tertutup sebagian atau seluruhnya.", "tidak_stres": "Mata terbuka penuh."},
    {"key": "pembukaan_paruh", "name": "Pembukaan Paruh",
     "question": "Apakah paruh ayam terbuka sebagian atau seluruhnya (terutama saat bernapas/terengah-engah)?",
     "stres": "Paruh terbuka sebagian atau seluruhnya, terutama saat bernapas/terengah-engah.",
     "tidak_stres": "Paruh tertutup / normal."},
    {"key": "posisi_sayap", "name": "Posisi Sayap", "question": "Apakah sayap ayam terkulai atau menggantung?",
     "stres": "Sayap terlihat terkulai atau menggantung.", "tidak_stres": "Sayap terlipat rapi di badan."},
    {"key": "postur_kaki", "name": "Postur Kaki",
     "question": "Apakah ayam menunjukkan postur membungkuk/merunduk dengan kaki menekuk, berjongkok, duduk, atau berbaring?",
     "stres": "Postur membungkuk/merunduk, kaki menekuk, berjongkok, duduk, atau berbaring.",
     "tidak_stres": "Berdiri tegak dengan kaki lurus."},
    {"key": "kondisi_bulu", "name": "Kondisi Bulu",
     "question": "Apakah bulu ayam mengembang atau kusut, terutama di area leher, punggung bawah, dan dada bawah?",
     "stres": "Bulu mengembang atau kusut, terutama di leher, punggung bawah, dan dada bawah.",
     "tidak_stres": "Bulu rapi, menempel ke badan."},
]
STRESS_THRESHOLD = 3
MIN_VISIBLE_INDICATORS = 5

SCS_USER_PROMPT = (
    "Berikut adalah foto satu ekor ayam. Nilai postur ayam ini sesuai 7 indikator Stressed Chicken Scale "
    "yang sudah dijelaskan, lalu balas dalam format JSON yang diminta."
)


def build_scs_system_prompt_eval(indicators=SCS_INDICATORS, threshold=STRESS_THRESHOLD,
                                 min_visible=MIN_VISIBLE_INDICATORS):
    """Versi panjang: dipakai saat training dan evaluasi Kaggle (predictions.csv)."""
    lines = [
        "Kamu adalah asisten penilai postur ayam berdasarkan Stressed Chicken Scale (SCS).",
        "Amati SATU ekor ayam pada gambar dari posisi lateral (samping), lalu nilai 7 indikator berikut.",
        "Untuk setiap indikator, jawab salah satu dari TIGA pilihan berikut, HANYA berdasarkan apa yang",
        "benar-benar terlihat di gambar -- jangan menebak, jangan menilai dari asumsi lain:",
        '  - "YA"             -> sinyal stres pada indikator ini MUNCUL dan terlihat jelas.',
        '  - "TIDAK"          -> bagian tubuh terkait TERLIHAT jelas, dan sinyal stresnya TIDAK muncul.',
        '  - "TIDAK_TERLIHAT" -> bagian tubuh terkait TIDAK ADA / TIDAK TERLIHAT di foto (misal foto',
        "                        ke-crop cuma sampai kepala, jadi ekor/sayap/kaki tidak kelihatan sama",
        '                        sekali) -- JANGAN menebak "TIDAK" kalau sebenarnya bagian itu tidak',
        "                        tampak di foto; jujur pakai TIDAK_TERLIHAT.",
        "",
    ]
    for i, ind in enumerate(indicators, 1):
        lines.append(f"{i}. {ind['name']} -- {ind['question']}")
        lines.append(f"   YA (stres) jika: {ind['stres']}")
        lines.append(f"   TIDAK jika: {ind['tidak_stres']}")
        lines.append("   TIDAK_TERLIHAT jika bagian tubuh ini tidak tampak sama sekali di foto.")
    lines += [
        "",
        "Aturan penilaian akhir (dihitung ulang oleh sistem, kamu tidak perlu menghitungnya sendiri,",
        "cukup jawab tiap indikator dengan jujur dan konsisten):",
        '  1. Hitung berapa indikator yang TERLIHAT (dijawab "YA" atau "TIDAK", BUKAN "TIDAK_TERLIHAT").',
        f"  2. Jika jumlah indikator yang terlihat < {min_visible} dari {len(indicators)} -> label akhir \"undefined\"",
        "     (foto tidak cukup informatif untuk dinilai sesuai SCS).",
        f'  3. Kalau cukup terlihat (>= {min_visible}), hitung total jawaban "YA". Jika total >= {threshold}',
        f'     dari {len(indicators)} -> label akhir "stress". Jika kurang dari {threshold} -> label akhir "not_stress".',
        "",
        "Balas HANYA dengan JSON valid, tanpa teks lain, dengan format persis:",
        "{",
        '  "indicators": {',
    ] + [f'    "{ind["key"]}": "YA, TIDAK, atau TIDAK_TERLIHAT",' for ind in indicators] + [
        "  },",
        '  "label": "stress, not_stress, atau undefined"',
        "}",
    ]
    return "\n".join(lines)


def build_scs_system_prompt_notebook04(indicators=SCS_INDICATORS):
    """Versi pendek: notebook inference-vlm-lora-huggingface.ipynb dan apps/inference/app/scs.py."""
    lines = [
        "Kamu adalah asisten penilai postur ayam berdasarkan Stressed Chicken Scale (SCS).",
        "Amati SATU ekor ayam pada gambar dari posisi lateral (samping), lalu nilai 7 indikator berikut.",
        "Untuk setiap indikator, jawab salah satu dari TIGA pilihan berikut, HANYA berdasarkan apa yang",
        "benar-benar terlihat di gambar -- jangan menebak, jangan menilai dari asumsi lain:",
        '  - "YA"             -> sinyal stres pada indikator ini MUNCUL dan terlihat jelas.',
        '  - "TIDAK"          -> bagian tubuh terkait TERLIHAT jelas, dan sinyal stresnya TIDAK muncul.',
        '  - "TIDAK_TERLIHAT" -> bagian tubuh terkait TIDAK ADA / TIDAK TERLIHAT di foto -- jangan menebak.',
        "",
    ]
    for i, ind in enumerate(indicators, 1):
        lines.append(f"{i}. {ind['name']} -- {ind['question']}")
        lines.append(f"   YA (stres) jika: {ind['stres']}")
        lines.append(f"   TIDAK jika: {ind['tidak_stres']}")
        lines.append("   TIDAK_TERLIHAT jika bagian tubuh ini tidak tampak sama sekali di foto.")
    lines += [
        "", "Balas HANYA dengan JSON valid, tanpa teks lain, dengan format persis:", "{", '  "indicators": {',
    ] + [f'    "{ind["key"]}": "YA, TIDAK, atau TIDAK_TERLIHAT",' for ind in indicators] + [
        "  },", '  "label": "stress, not_stress, atau undefined"', "}",
    ]
    return "\n".join(lines)


def parse_vlm_json(raw_text):
    match = re.search(r"\{.*\}", raw_text, flags=re.DOTALL)
    if not match:
        raise ValueError(f"Tidak ditemukan JSON pada output VLM: {raw_text!r}")
    return json.loads(match.group(0))


def normalize_indicator_answer(raw_value):
    raw_val = str(raw_value).strip().upper().replace(" ", "_")
    if raw_val.startswith("YA"):
        return "YA"
    if raw_val.startswith("TIDAK_TERLIHAT") or raw_val in {"TT", "NA", "N/A", "TIDAK_ADA", "TIDAK_TAMPAK", "NONE", ""}:
        return "TIDAK_TERLIHAT"
    if raw_val.startswith("TIDAK"):
        return "TIDAK"
    return "TIDAK_TERLIHAT"


def apply_scs_rule(indicators_dict, indicators=SCS_INDICATORS, threshold=STRESS_THRESHOLD,
                   min_visible=MIN_VISIBLE_INDICATORS):
    total_ya, visible_count, normalized = 0, 0, {}
    for ind in indicators:
        answer = normalize_indicator_answer(indicators_dict.get(ind["key"], "TIDAK_TERLIHAT"))
        normalized[ind["key"]] = answer
        if answer != "TIDAK_TERLIHAT":
            visible_count += 1
        if answer == "YA":
            total_ya += 1
    if visible_count < min_visible:
        label = "undefined"
    else:
        label = "stress" if total_ya >= threshold else "not_stress"
    return normalized, total_ya, visible_count, label, total_ya / len(indicators)


# --- Quality gate (opsional): disalin dari notebook 04 sel 5 / apps/inference/app/quality.py ---
def quality_score(img_bgr, blur_threshold=100, dark_thresh=40, bright_thresh=215):
    import cv2
    if img_bgr is None:
        return {"ok": False, "issues": ["gagal_dibaca_atau_blank"]}
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    brightness = float(gray.mean())
    issues = []
    if laplacian_var < blur_threshold: issues.append("blur")
    if brightness < dark_thresh: issues.append("terlalu_gelap")
    if brightness > bright_thresh: issues.append("terlalu_terang")
    if bool(gray.std() < 3): issues.append("blank_or_occluded")
    return {"ok": len(issues) == 0, "issues": issues}


def enhance_image(img_bgr):
    import cv2
    import numpy as np
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    enhanced = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    enhanced = cv2.fastNlMeansDenoisingColored(enhanced, None, h=5, hColor=5, templateWindowSize=7, searchWindowSize=21)
    return cv2.filter2D(enhanced, -1, np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]]))


def load_image(path, use_quality_gate):
    """Kembalikan (PIL RGB | None, status_quality)."""
    from PIL import Image
    if not use_quality_gate:
        return Image.open(path).convert("RGB"), "tidak_dipakai"
    import cv2
    img_bgr = cv2.imread(path)
    if quality_score(img_bgr)["ok"]:
        status = "ok"
    else:
        img_bgr = enhance_image(img_bgr)
        if not quality_score(img_bgr)["ok"]:
            return None, "skipped"
        status = "enhanced"
    return Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)), status


# --- Utilitas ---
def resolve_hf_token():
    """Colab Secrets -> env HF_TOKEN/HUGGING_FACE_HUB_TOKEN -> getpass. Tidak pernah ditulis ke berkas."""
    token = None
    try:
        from google.colab import userdata  # type: ignore
        token = userdata.get("HF_TOKEN")
    except Exception:  # bukan di Colab, atau secret belum diberi akses
        token = None
    token = token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not token:
        token = getpass.getpass("Masukkan HF access token (read): ").strip()
    if not token:
        raise RuntimeError("HF token kosong; repo adapter private tidak bisa diakses.")
    return token


def read_test_items(manifest_path, data_dir):
    with open(manifest_path, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["split"].strip().lower() == "test"]
    items = []
    for r in rows:
        path = os.path.join(data_dir, *r["file_crop_final"].strip().split("/"))
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Crop tidak ditemukan: {path} (cek --data)")
        items.append({"instance_id": r["instance_id"], "file_name": os.path.basename(path),
                      "path": path, "label_manifest": r["label_akhir"]})
    return items


def read_reference_predictions(path):
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8", newline="") as f:
        return {r["file_name"]: r for r in csv.DictReader(f)}


def percentile(values, q):
    """Persentil linear (sama dengan numpy.percentile default)."""
    s = sorted(values)
    k = (len(s) - 1) * q / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def summarize(values):
    return {"n": len(values), "mean": statistics.mean(values), "median": statistics.median(values),
            "p95": percentile(values, 95), "min": min(values), "max": max(values),
            "std": statistics.stdev(values) if len(values) > 1 else 0.0}


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Ukur waktu inference VLM Qwen3-VL + LoRA pada crop test (hanya inference, tanpa training).")
    p.add_argument("--data", default="data/working/dataset",
                   help="Folder akar dataset; file_crop_final di manifest relatif terhadap folder ini.")
    p.add_argument("--manifest", default="docs/manifest/manifest_instance.csv",
                   help="Manifest instance; baris split == test dipakai.")
    p.add_argument("--predictions",
                   default="results/vlm/evaluation/Fine-tuned_VLM_SCS_prompt_LoRA/predictions.csv",
                   help="predictions.csv fine-tuned untuk pencocokan label.")
    p.add_argument("--experiments", default="results/vlm/vlm_experiments.json",
                   help="vlm_experiments.json untuk memverifikasi prompt (dilewati jika tidak ada).")
    p.add_argument("--out", default="inference_time_output", help="Folder keluaran.")
    p.add_argument("--repeats", type=int, default=3, help="Pengulangan per citra (default 3).")
    p.add_argument("--adapter", default=ADAPTER_REPO, help="Repo HF atau folder lokal adapter LoRA.")
    p.add_argument("--adapter-revision", default=None, help="Revision adapter (default: main).")
    p.add_argument("--base-revision", default=BASE_REVISION, help="Revision model dasar.")
    p.add_argument("--prompt", choices=["eval", "notebook04"], default="eval",
                   help="eval = prompt panjang yang menghasilkan predictions.csv (default); "
                        "notebook04 = prompt pendek notebook inference/FastAPI.")
    p.add_argument("--quality-gate", action="store_true",
                   help="Sertakan quality gate notebook 04 dalam waktu end-to-end (default: tidak, "
                        "sama dengan evaluasi Kaggle).")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    items = read_test_items(args.manifest, args.data)
    reference = read_reference_predictions(args.predictions)
    print(f"{len(items)} crop test dari {args.manifest}")

    system_prompt = build_scs_system_prompt_eval() if args.prompt == "eval" else build_scs_system_prompt_notebook04()
    user_prompt = SCS_USER_PROMPT
    prompt_check = "tidak diperiksa (vlm_experiments.json tidak ditemukan)"
    if args.experiments and os.path.isfile(args.experiments):
        with open(args.experiments, encoding="utf-8") as f:
            meta = json.load(f)["_meta"]
        same_sys = meta["system_prompt"] == build_scs_system_prompt_eval()
        same_user = meta["user_prompt"] == SCS_USER_PROMPT
        if not (same_sys and same_user):
            raise RuntimeError("Prompt di skrip tidak sama dengan vlm_experiments.json; hentikan agar "
                               "pengukuran tidak memakai prompt yang berbeda dari evaluasi.")
        prompt_check = "prompt eval identik dengan vlm_experiments.json"
    print("Prompt:", args.prompt, "|", prompt_check)

    import torch
    import transformers
    import peft
    from huggingface_hub import HfApi
    from peft import PeftModel
    from transformers import AutoProcessor

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA tidak tersedia. Aktifkan GPU: Runtime > Change runtime type > GPU.")
    device = "cuda"
    dtype = torch.float16  # sama dengan evaluasi Kaggle (T4 = fp16)

    hf_token = resolve_hf_token()

    def sync():
        torch.cuda.synchronize()

    t_load = time.perf_counter()
    processor = AutoProcessor.from_pretrained(BASE_MODEL, revision=args.base_revision,
                                              min_pixels=MIN_PIXELS, max_pixels=MAX_PIXELS)
    try:
        from transformers import Qwen3VLForConditionalGeneration as ModelCls
    except ImportError:
        from transformers import AutoModelForImageTextToText as ModelCls
    base = ModelCls.from_pretrained(BASE_MODEL, revision=args.base_revision, dtype=dtype,
                                    low_cpu_mem_usage=True).to(device)
    base.eval()
    model = PeftModel.from_pretrained(base, args.adapter, revision=args.adapter_revision, token=hf_token)
    model.eval()
    sync()
    load_seconds = time.perf_counter() - t_load

    adapter_sha = None
    if not os.path.isdir(args.adapter):
        try:
            adapter_sha = HfApi().model_info(args.adapter, revision=args.adapter_revision, token=hf_token).sha
        except Exception as exc:  # informasi saja
            adapter_sha = f"tidak terbaca: {type(exc).__name__}"
    param_dtype = str(next(model.parameters()).dtype)
    print(f"Model dimuat dalam {load_seconds:.1f} s | dtype {param_dtype} | adapter sha {adapter_sha}")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": user_prompt}]},
    ]

    def run_once(path):
        """Satu pengukuran. Kembalikan waktu (a) generate dan (b) end-to-end beserta hasil."""
        sync()
        t_b0 = time.perf_counter()
        image, quality_status = load_image(path, args.quality_gate)
        if image is None:
            sync()
            return {"t_generate_s": None, "t_end_to_end_s": time.perf_counter() - t_b0, "label": None,
                    "quality_status": quality_status, "n_input_tokens": None, "n_new_tokens": 0,
                    "parse_error": None, "indicators": None, "raw_response": None}
        chat_text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = processor(text=[chat_text], images=[image], return_tensors="pt").to(model.device)
        sync()
        t_a0 = time.perf_counter()
        with torch.no_grad():
            output_ids = model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS, do_sample=DO_SAMPLE)
        sync()
        t_a1 = time.perf_counter()
        n_in = inputs["input_ids"].shape[1]
        trimmed = output_ids[:, n_in:]
        raw_text = processor.batch_decode(trimmed, skip_special_tokens=True)[0]
        try:
            parsed = parse_vlm_json(raw_text)
            normalized, _, _, label, _ = apply_scs_rule(parsed.get("indicators", {}))
            parse_error = None
        except Exception as exc:  # sama dengan notebook: gagal parse -> semua TIDAK_TERLIHAT
            normalized, _, _, label, _ = apply_scs_rule({ind["key"]: "TIDAK_TERLIHAT" for ind in SCS_INDICATORS})
            parse_error = str(exc)
        sync()
        t_b1 = time.perf_counter()
        return {"t_generate_s": t_a1 - t_a0, "t_end_to_end_s": t_b1 - t_b0, "label": label,
                "quality_status": quality_status, "n_input_tokens": int(n_in),
                "n_new_tokens": int(trimmed.shape[1]), "parse_error": parse_error,
                "indicators": normalized, "raw_response": raw_text}

    print("Warm-up (tidak dihitung):", items[0]["file_name"])
    run_once(items[0]["path"])
    torch.cuda.reset_peak_memory_stats()

    log_rows, results = [], {}
    for rep in range(1, args.repeats + 1):
        for it in items:
            r = run_once(it["path"])
            results.setdefault(it["file_name"], []).append(r)
            log_rows.append({
                "instance_id": it["instance_id"], "file_name": it["file_name"], "pengulangan": rep,
                "waktu_generate_s": "" if r["t_generate_s"] is None else f"{r['t_generate_s']:.4f}",
                "waktu_end_to_end_s": f"{r['t_end_to_end_s']:.4f}",
                "label_prediksi": r["label"] or "", "n_token_input": r["n_input_tokens"] or "",
                "n_token_baru": r["n_new_tokens"], "status_quality": r["quality_status"],
                "parse_error": r["parse_error"] or "",
            })
            gen = "-" if r["t_generate_s"] is None else f"{r['t_generate_s']:.2f}"
            print(f"  rep {rep} {it['file_name']}: generate {gen} s | end-to-end "
                  f"{r['t_end_to_end_s']:.2f} s | {r['label']}")
    peak_mem_gb = torch.cuda.max_memory_allocated() / 1024 ** 3

    with open(os.path.join(args.out, "inference_time_log.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(log_rows[0].keys()))
        w.writeheader()
        w.writerows(log_rows)

    t_gen = [r["t_generate_s"] for rs in results.values() for r in rs if r["t_generate_s"] is not None]
    t_e2e = [r["t_end_to_end_s"] for rs in results.values() for r in rs]
    stats = {"generate": summarize(t_gen), "end_to_end": summarize(t_e2e)}

    # Pencocokan label dan indikator dengan predictions.csv fine-tuned
    match_rows, n_label_ok, n_ind_ok, n_stable = [], 0, 0, 0
    for it in items:
        rs = results[it["file_name"]]
        labels = [r["label"] for r in rs]
        stable = len(set(labels)) == 1
        n_stable += stable
        ref = reference.get(it["file_name"]) if reference else None
        ref_label = ref["label"] if ref else None
        ref_ind = None
        if ref:
            import ast
            ref_ind = ast.literal_eval(ref["indicators"])
        label_ok = ref is not None and all(lbl == ref_label for lbl in labels)
        ind_ok = ref is not None and all(r["indicators"] == ref_ind for r in rs)
        n_label_ok += label_ok
        n_ind_ok += ind_ok
        match_rows.append((it, labels, ref_label, label_ok, ind_ok, stable))

    env = {
        "tanggal_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "gpu": torch.cuda.get_device_name(0),
        "vram_total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1024 ** 3, 2),
        "vram_puncak_teralokasi_gb": round(peak_mem_gb, 2),
        "cuda_runtime": torch.version.cuda,
        "python": platform.python_version(),
        "torch": torch.__version__,
        "transformers": transformers.__version__,
        "peft": peft.__version__,
        "model_dasar": BASE_MODEL,
        "revision_model_dasar": args.base_revision,
        "revision_model_dasar_terpakai": getattr(base.config, "_commit_hash", None),
        "kelas_model": type(base).__name__,
        "adapter": args.adapter,
        "adapter_revision_diminta": args.adapter_revision,
        "adapter_sha": adapter_sha,
        "dtype": param_dtype,
        "kuantisasi": "tidak ada",
        "min_pixels": MIN_PIXELS,
        "max_pixels": MAX_PIXELS,
        "max_new_tokens": MAX_NEW_TOKENS,
        "do_sample": DO_SAMPLE,
        "varian_prompt": args.prompt,
        "sha256_system_prompt": hashlib.sha256(system_prompt.encode("utf-8")).hexdigest(),
        "pemeriksaan_prompt": prompt_check,
        "quality_gate": args.quality_gate,
        "jumlah_citra": len(items),
        "pengulangan": args.repeats,
        "waktu_muat_model_s": round(load_seconds, 2),
    }
    with open(os.path.join(args.out, "lingkungan.json"), "w", encoding="utf-8") as f:
        json.dump(env, f, indent=2, ensure_ascii=False)

    def fmt(v):
        return f"{v:.2f}".replace(".", ",")

    lines = [
        "# Ringkasan waktu inference VLM (Qwen3-VL-4B + LoRA)",
        "",
        f"Tanggal (UTC): {env['tanggal_utc']}. GPU: {env['gpu']} ({fmt(env['vram_total_gb'])} GB). "
        f"torch {env['torch']}, transformers {env['transformers']}, peft {env['peft']}, dtype {param_dtype}, "
        "tanpa kuantisasi.",
        f"Prompt: `{args.prompt}` ({prompt_check}). Quality gate: {'ya' if args.quality_gate else 'tidak'}. "
        f"max_new_tokens={MAX_NEW_TOKENS}, do_sample={DO_SAMPLE}.",
        f"Pengukuran: {len(items)} citra x {args.repeats} pengulangan = {len(t_e2e)} pengukuran, "
        "setelah 1 kali warm-up yang tidak dihitung. `torch.cuda.synchronize()` dipanggil sebelum dan "
        "sesudah setiap pengukuran.",
        "",
        "| Waktu (detik) | n | Rata-rata | Median | Persentil 95 | Minimum | Maksimum | Simpangan baku |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for key, name in (("generate", "(a) hanya `model.generate`"),
                      ("end_to_end", "(b) end-to-end (praproses + generate + parsing)")):
        s = stats[key]
        lines.append(f"| {name} | {s['n']} | {fmt(s['mean'])} | {fmt(s['median'])} | {fmt(s['p95'])} | "
                     f"{fmt(s['min'])} | {fmt(s['max'])} | {fmt(s['std'])} |")
    lines += [
        "",
        f"Waktu memuat model (sekali, tidak termasuk di atas): {fmt(load_seconds)} s. "
        f"VRAM puncak teralokasi saat pengukuran: {fmt(peak_mem_gb)} GB.",
        "",
        "## Pencocokan label dengan predictions.csv fine-tuned",
        "",
    ]
    if reference is None:
        lines.append(f"Berkas `{args.predictions}` tidak ditemukan, pencocokan tidak dilakukan.")
    else:
        lines += [
            f"- Label sama dengan predictions.csv pada semua pengulangan: {n_label_ok} dari {len(items)} citra.",
            f"- Ketujuh jawaban indikator sama persis: {n_ind_ok} dari {len(items)} citra.",
            f"- Label stabil antar-pengulangan: {n_stable} dari {len(items)} citra.",
            "",
            "| instance_id | Berkas | Label predictions.csv | Label skrip (per pengulangan) | Label cocok | Indikator cocok |",
            "|---|---|---|---|---|---|",
        ]
        for it, labels, ref_label, label_ok, ind_ok, _ in match_rows:
            lines.append(f"| {it['instance_id']} | {it['file_name']} | {ref_label} | {', '.join(map(str, labels))} | "
                         f"{'ya' if label_ok else 'TIDAK'} | {'ya' if ind_ok else 'TIDAK'} |")
        if n_label_ok < len(items):
            lines += ["", "Ada label yang tidak cocok. Kemungkinan penyebab: versi transformers/torch atau jenis "
                      "GPU berbeda dari Kaggle (greedy decoding fp16 tidak dijamin identik antar-perangkat), "
                      "revision adapter di Hub berbeda dari adapter lokal Kaggle, atau `--prompt notebook04` "
                      "dipakai. Waktu inference tetap valid, tetapi kesetaraan label tidak terbukti."]
    lines += [
        "",
        "## Keterbatasan",
        "",
        f"- Hanya {len(items)} citra test; distribusi waktu pada data lain bisa berbeda.",
        f"- Persentil 95 dihitung dari {len(t_e2e)} pengukuran (interpolasi linear), jadi hanya perkiraan kasar.",
        "- Hasil bergantung pada jenis GPU Colab yang didapat (misalnya T4 vs L4 vs A100), versi pustaka, dan "
        "beban mesin saat itu.",
        "- Waktu generate sebanding dengan jumlah token keluaran (kolom `n_token_baru` di log); jawaban JSON "
        "yang lebih panjang membutuhkan waktu lebih lama.",
        "- Batch size 1, tanpa kuantisasi, adapter LoRA tidak digabung (merge) ke bobot dasar, sama dengan "
        "evaluasi Kaggle dan layanan FastAPI saat ini.",
        "- Waktu end-to-end tidak mencakup unggah citra lewat jaringan, API, atau voting temporal.",
    ]
    with open(os.path.join(args.out, "ringkasan.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\nSelesai. Keluaran di {os.path.abspath(args.out)}:")
    for name in ("inference_time_log.csv", "lingkungan.json", "ringkasan.md"):
        print("  -", name)
    print(f"(a) generate: rata-rata {stats['generate']['mean']:.2f} s | "
          f"(b) end-to-end: rata-rata {stats['end_to_end']['mean']:.2f} s")
    if reference is not None:
        print(f"Label cocok dengan predictions.csv: {n_label_ok}/{len(items)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

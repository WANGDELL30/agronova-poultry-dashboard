"""SCS prompt + rule. Copied UNCHANGED from notebook 04 (cell 7). Do not edit logic here."""
import json
import re

# --- 7 indikator SCS + aturan (identik dgn Kaggle 02_models.ipynb) ---
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
STRESS_THRESHOLD = 3          # HARUS sama dengan threshold final yang dipakai saat training terakhir di Kaggle
MIN_VISIBLE_INDICATORS = 5    # idem -- lihat `vlm_experiments["_meta"]` di Kaggle kalau lupa nilainya
CLASS_NAMES_3 = ["not_stress", "stress", "undefined"]


def build_scs_system_prompt(indicators=SCS_INDICATORS, threshold=STRESS_THRESHOLD, min_visible=MIN_VISIBLE_INDICATORS):
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


SCS_SYSTEM_PROMPT = build_scs_system_prompt()
SCS_USER_PROMPT = ("Berikut adalah foto satu ekor ayam. Nilai postur ayam ini sesuai 7 indikator "
                    "Stressed Chicken Scale yang sudah dijelaskan, lalu balas dalam format JSON yang diminta.")


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


def apply_scs_rule(indicators_dict, indicators=SCS_INDICATORS, threshold=STRESS_THRESHOLD, min_visible=MIN_VISIBLE_INDICATORS):
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

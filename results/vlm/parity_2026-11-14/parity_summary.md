# Verifikasi GPU PV1–PV9 (2026-11-14T03:10:20Z)

- Kode layanan: `fix/web-batch-1` @ `ac85743103958d3798921c9881cb609f238cfa4b` (test(api): give the K9 HTTP 503 test time to boot Nest under a full parallel run [K9])
- Base `ebb281ec70b0`, adapter `51b653173b0e`; 68 gambar; durasi 32.0 menit
- Bagian selesai: PV8, PV2, PV4, PV1, PV3, PV5, PV6, PV9

## PV8 (S10, P7): lingkungan

- GPU Tesla T4, driver 580.82.07, CUDA torch 13.0, torch 2.14.1+cu130, transformers 5.21.0, peft 0.21.2, cv2 4.10.0, Python 3.13.16
- Beda dari versi tercatat: torch 2.11.0+cu130→2.14.1+cu130
- Revision yang dilaporkan layanan: base `None`, adapter `None`; cocok pin: {'base': False, 'adapter': False}
- Dtype parameter: app {'float16': 0.9987, 'float32': 0.0013}, notebook {'float16': 0.9987, 'float32': 0.0013}; sama: **True** (tidak diseragamkan); bf16 native GPU: True
- Patch sel load notebook: device_map=device ditambahkan ke 2 panggilan from_pretrained; argumen lain apa adanya

## PV1 (P9, P4): parity app vs notebook 04 — **PASS**

- Wajib identik (quality + 7 indikator + label + total_ya + visible_count): **68/68**
- Label identik 68/68, indikator identik 68/68, total_ya 68/68, visible_count 68/68
- Teks mentah identik: **68/68 (100.0%)**; piksel input identik 68/68
- Jalur quality (layanan): {'ok': 63, 'enhanced': 5}; notebook: {'ok': 63, 'enhanced': 5}; enhanced identik 5/5
- Cakupan minimum P4 (5 ok / 3 enhanced / 2 skipped): ["WARNING: 0 'skipped' image(s), below the minimum of 2; N/N identical does not prove parity for this path"]
- `scripts/parity_check.compare` repo: 68/68 tanpa masalah

Ketidakcocokan wajib: tidak ada

## PV2 (P1): prompt layanan vs prompt training (crop berlabel, input sama)

- System prompt sama: False; user prompt sama: True
- Label sama antar prompt: 16/17; 7 indikator sama: 13/17
- Prompt training mereproduksi `predictions.csv`: 8/8

| Prompt | n | akurasi | benar | rasio undefined | rata-rata visible_count |
|---|---|---|---|---|---|
| service_prompt | 17 | 0.941 | 16 | 0.235 | 6.235 |
| training_prompt | 17 | 0.882 | 15 | 0.235 | 6.235 |

Confusion matrix service_prompt:

| GT \ prediksi | stress | not_stress | undefined | no_result |
|---|---|---|---|---|
| not_stress | 0 | 2 | 1 | 0 |
| stress | 11 | 0 | 0 | 0 |
| undefined | 0 | 0 | 3 | 0 |

Confusion matrix training_prompt:

| GT \ prediksi | stress | not_stress | undefined | no_result |
|---|---|---|---|---|
| not_stress | 1 | 1 | 1 | 0 |
| stress | 11 | 0 | 0 | 0 |
| undefined | 0 | 0 | 3 | 0 |

## PV3 (P2): akurasi layanan, crop vs frame utuh

| Jenis | n | akurasi | benar | rasio undefined | tanpa hasil |
|---|---|---|---|---|---|
| crop | 17 | 0.941 | 16 | 0.235 | 0 |
| frame | 47 | 0.702 | 33 | 0.064 | 0 |

Confusion matrix crop:

| GT \ prediksi | stress | not_stress | undefined | no_result |
|---|---|---|---|---|
| not_stress | 0 | 2 | 1 | 0 |
| stress | 11 | 0 | 0 | 0 |
| undefined | 0 | 0 | 3 | 0 |

Confusion matrix frame:

| GT \ prediksi | stress | not_stress | undefined | no_result |
|---|---|---|---|---|
| not_stress | 7 | 10 | 1 | 0 |
| stress | 23 | 4 | 2 | 0 |

Frame GT `mixed` (tidak dihitung di akurasi): [{'image_id': 'images/frames/train/s4_jpg.rf.a2b66a0923228b230c9b84860ecb7b48.jpg', 'label': 'not_stress'}, {'image_id': 'images/frames/train/IMG_20250511_140105_jpg.rf.9d14fca27731cf6972d540d7bec4375c.jpg', 'label': 'not_stress'}, {'image_id': 'images/frames/train/IMG_20250511_135949_jpg.rf.e5ccd5e52968fcd05e1d7101cdece04c.jpg', 'label': 'not_stress'}, {'image_id': 'images/frames/train/IMG_20250511_140154_jpg.rf.d692a8a6d8488cc873c4ec11ffe686a3.jpg', 'label': 'stress'}]

## PV4 (P3): enhanced vs asli

| gambar | GT | enhanced (label/YA) | asli (label/YA) | indikator sama |
|---|---|---|---|---|
| stress_0001.jpg | undefined | undefined/1 | undefined/1 | True |
| hs01_jpeg.rf.853acf3a6190a72bed4a9811fa4 | stress | undefined/1 | undefined/1 | True |
| s3_jpg.rf.0baa582ee2b5d7a62f8c71050fd238 | stress | not_stress/2 | not_stress/2 | True |
| 73_NormalChicken_jpg.rf.8d50ceda103355d3 | not_stress | undefined/0 | undefined/0 | True |
| IMG_-_-_jpg.rf.ac466c0d3196deb463c628abc | not_stress | not_stress/2 | not_stress/1 | False |

## PV5 (K1/V1): voting aturan lama vs baru

- Sebaran YA frame berlabel `stress`: {3: 25, 4: 16, 6: 1}
- Frame yang menjadi suara — aturan lama (confidence ≥ 0,6): {'stress': 1, 'not_stress': 19}; aturan baru (semua stress/not_stress): {'stress': 42, 'not_stress': 19}

Simulasi 200 urutan acak × 10 frame (window 5, alert ≥ 3), % urutan yang memicu alert:

| Pool | frame | aturan lama | aturan baru |
|---|---|---|---|
| gt_stress | 40 | 0.0 | 100.0 |
| gt_not_stress | 21 | 0.0 | 48.0 |
| app_label_stress_or_not_stress | 61 | 0.0 | 98.0 |

## PV6 (K4): contoh raw_response (classified)

`images/crops/test/not_stress/not_stress_0003.jpg` (stress, 3 YA); `raw_response` di respons layanan terisi: True
```
{"indicators": {"posisi_ekor": "TIDAK", "posisi_kepala": "TIDAK", "penutupan_mata": "YA", "pembukaan_paruh": "YA", "posisi_sayap": "TIDAK", "postur_kaki": "TIDAK", "kondisi_bulu": "YA"}, "label": "stress"}
```
`images/crops/test/not_stress/not_stress_0002.jpg` (not_stress, 1 YA); `raw_response` di respons layanan terisi: True
```
{"indicators": {"posisi_ekor": "TIDAK_TERLIHAT", "posisi_kepala": "TIDAK", "penutupan_mata": "TIDAK", "pembukaan_paruh": "TIDAK", "posisi_sayap": "TIDAK", "postur_kaki": "TIDAK", "kondisi_bulu": "YA"}, "label": "stress"}
```
`images/crops/test/not_stress/not_stress_0001.jpg` (undefined, 0 YA); `raw_response` di respons layanan terisi: True
```
{"indicators": {"posisi_ekor": "TIDAK_TERLIHAT", "posisi_kepala": "TIDAK", "penutupan_mata": "TIDAK", "pembukaan_paruh": "TIDAK", "posisi_sayap": "TIDAK_TERLIHAT", "postur_kaki": "TIDAK_TERLIHAT", "kondisi_bulu": "TIDAK"}, "label": "not_stress"}
```

## PV9 (R1, P11): waktu, VRAM, token

| Tahap (detik) | n | p50 | p95 | maks |
|---|---|---|---|---|
| layanan: quality gate | 68 | 0.012 | 0.916 | 1.917 |
| layanan: generate | 68 | 9.785 | 11.159 | 13.767 |
| layanan: total classify_bytes | 68 | 9.793 | 11.552 | 13.784 |
| notebook: quality gate | 68 | 0.009 | 0.971 | 1.2 |
| notebook: generate | 68 | 9.694 | 11.132 | 11.729 |

- Load model: layanan 37.7 s, notebook 38.1 s; unduh 112.3 s
- Peak VRAM layanan: load {'max_allocated_gb': 8.31, 'max_reserved_gb': 8.328}, run {'max_allocated_gb': 8.647, 'max_reserved_gb': 8.719}
- memory_allocated setelah load: layanan 8.288 GB, notebook 8.296 GB; setelah dilepas: layanan 0.008 GB, notebook 0.008 GB
- Token gambar efektif: {'stats': {'n': 68, 'mean': 326.25, 'p50': 361.0, 'p95': 361.0, 'max': 361.0, 'min': 200.0}, 'distinct': {208: 2, 288: 1, 204: 1, 220: 2, 210: 3, 200: 1, 342: 1, 209: 6, 361: 51}}; contoh chat: {'chat_text_sha256': '551f6e444aafe92f810266f426cb86ce3f477ff946c5bb5410878efb28c51c49', 'input_tokens': 1390, 'image_tokens': 208, 'image_grid_thw': [[1, 32, 26]]}
- Usulan `INFERENCE_TIMEOUT_MS` = (1 + 2) × p95_total 11.552 s × 1,5 = **52000 ms** (default sekarang 120000)

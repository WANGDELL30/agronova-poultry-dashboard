# Ringkasan waktu inference VLM (Qwen3-VL-4B + LoRA)

Tanggal (UTC): 2026-10-28T06:35:58+00:00. GPU: Tesla T4 (14,56 GB). torch 2.11.0+cu130, transformers 5.21.0, peft 0.21.2, dtype torch.float16, tanpa kuantisasi.
Prompt: `eval` (prompt eval identik dengan vlm_experiments.json). Quality gate: tidak. max_new_tokens=400, do_sample=False.
Pengukuran: 8 citra x 3 pengulangan = 24 pengukuran, setelah 1 kali warm-up yang tidak dihitung. `torch.cuda.synchronize()` dipanggil sebelum dan sesudah setiap pengukuran.

| Waktu (detik) | n | Rata-rata | Median | Persentil 95 | Minimum | Maksimum | Simpangan baku |
|---|---|---|---|---|---|---|---|
| (a) hanya `model.generate` | 24 | 11,20 | 11,12 | 12,31 | 10,17 | 12,41 | 0,84 |
| (b) end-to-end (praproses + generate + parsing) | 24 | 11,22 | 11,13 | 12,32 | 10,19 | 12,43 | 0,84 |

Waktu memuat model (sekali, tidak termasuk di atas): 156,12 s. VRAM puncak teralokasi saat pengukuran: 9,59 GB.

## Pencocokan label dengan predictions.csv fine-tuned

- Label sama dengan predictions.csv pada semua pengulangan: 8 dari 8 citra.
- Ketujuh jawaban indikator sama persis: 8 dari 8 citra.
- Label stabil antar-pengulangan: 8 dari 8 citra.

| instance_id | Berkas | Label predictions.csv | Label skrip (per pengulangan) | Label cocok | Indikator cocok |
|---|---|---|---|---|---|
| INST-002 | not_stress_0003.jpg | stress | stress, stress, stress | ya | ya |
| INST-046 | stress_0001.jpg | undefined | undefined, undefined, undefined | ya | ya |
| INST-047 | stress_0005.jpg | stress | stress, stress, stress | ya | ya |
| INST-049 | stress_0003.jpg | stress | stress, stress, stress | ya | ya |
| INST-050 | stress_0002.jpg | undefined | undefined, undefined, undefined | ya | ya |
| INST-061 | stress_0004.jpg | stress | stress, stress, stress | ya | ya |
| INST-068 | not_stress_0002.jpg | not_stress | not_stress, not_stress, not_stress | ya | ya |
| INST-069 | not_stress_0001.jpg | undefined | undefined, undefined, undefined | ya | ya |

## Keterbatasan

- Hanya 8 citra test; distribusi waktu pada data lain bisa berbeda.
- Persentil 95 dihitung dari 24 pengukuran (interpolasi linear), jadi hanya perkiraan kasar.
- Hasil bergantung pada jenis GPU Colab yang didapat (misalnya T4 vs L4 vs A100), versi pustaka, dan beban mesin saat itu.
- Waktu generate sebanding dengan jumlah token keluaran (kolom `n_token_baru` di log); jawaban JSON yang lebih panjang membutuhkan waktu lebih lama.
- Batch size 1, tanpa kuantisasi, adapter LoRA tidak digabung (merge) ke bobot dasar, sama dengan evaluasi Kaggle dan layanan FastAPI saat ini.
- Waktu end-to-end tidak mencakup unggah citra lewat jaringan, API, atau voting temporal.

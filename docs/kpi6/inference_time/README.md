# Pengukuran waktu inference VLM (KPI 6)

`measure_inference_time.py` mengukur waktu inference Qwen3-VL-4B-Instruct + adapter LoRA
(`Arga23/chickenstress-vlm-lora`) pada 8 crop test. Skrip hanya menjalankan inference, tidak melatih
ulang model. Pengaturannya mengikuti evaluasi Kaggle yang menghasilkan
`results/vlm/evaluation/Fine-tuned_VLM_SCS_prompt_LoRA/predictions.csv`: fp16 tanpa kuantisasi,
`min_pixels=256*28*28`, `max_pixels=512*28*28`, `max_new_tokens=400`, `do_sample=False`, *prompt* dari
`results/vlm/vlm_experiments.json`, dan revision model dasar `ebb281ec70b05090aa6165b016eac8ec08e71b17`.

## Menjalankan di Google Colab

1. **Runtime > Change runtime type > GPU** (T4 cukup, butuh sekitar 9 GB VRAM).
2. **Simpan token Hugging Face** di Colab Secrets (ikon kunci di panel kiri): nama `HF_TOKEN`, nilai
   token *read* dari akun yang punya akses ke repo adapter (private). Aktifkan *Notebook access*.
   Jangan menempel token di sel kode. Jika secret tidak tersedia, skrip membaca variabel lingkungan
   `HF_TOKEN` lalu meminta token lewat `getpass`.
3. **Siapkan repo dan data.** Pilih salah satu:

   a. Ambil repo (berisi `data/working/dataset`, `docs/manifest`, dan `results/vlm`):

   ```bash
   !git clone https://github.com/WANGDELL30/agronova-poultry-dashboard.git
   %cd agronova-poultry-dashboard
   ```

   Jika repo private, autentikasi git dulu dengan cara biasa Anda. Jangan menulis token ke berkas.

   b. Unggah manual: unggah `data/working/dataset/test/`, `docs/manifest/manifest_instance.csv`,
   `results/vlm/vlm_experiments.json`, `results/vlm/evaluation/Fine-tuned_VLM_SCS_prompt_LoRA/predictions.csv`,
   dan skrip ini. Sesuaikan path pada argumen di langkah 5.

4. **Pasang pustaka** (sama seperti notebook inference, `transformers>=4.57` untuk Qwen3-VL):

   ```bash
   !pip install -q -U "transformers>=4.57" peft accelerate huggingface_hub
   !pip uninstall -y torchao
   ```

   Jika Colab meminta *restart session* setelah instalasi, lakukan, lalu jalankan `%cd` lagi.

5. **Jalankan skrip:**

   ```bash
   !python docs/kpi6/inference_time/measure_inference_time.py \
       --data data/working/dataset \
       --manifest docs/manifest/manifest_instance.csv \
       --predictions results/vlm/evaluation/Fine-tuned_VLM_SCS_prompt_LoRA/predictions.csv \
       --experiments results/vlm/vlm_experiments.json \
       --out /content/inference_time
   ```

   Prosesnya: model dimuat sekali, 1 kali *warm-up* yang tidak dihitung, lalu 8 citra x 3 pengulangan
   = 24 pengukuran. Lihat `--help` untuk opsi lain:
   - `--prompt notebook04` memakai *prompt* pendek notebook inference/FastAPI.
   - `--quality-gate` menyertakan *quality gate* ke dalam waktu end-to-end.
   - `--adapter-revision <sha>` mengunci versi adapter.

   Pengukuran utama untuk laporan sebaiknya memakai opsi bawaan.

6. **Unduh hasil** dari `/content/inference_time/` lalu taruh di `results/vlm/inference_time/` pada repo:
   - `inference_time_log.csv`: log mentah per pengukuran (instance_id, berkas, pengulangan, waktu
     generate, waktu end-to-end, label prediksi, jumlah token, status *quality*, *parse error*).
   - `lingkungan.json`: GPU, VRAM, versi torch/transformers/peft, dtype, kuantisasi, revision model
     dasar, sha adapter, dan tanggal.
   - `ringkasan.md`: rata-rata, median, persentil 95, minimum, maksimum, hasil pencocokan label dengan
     `predictions.csv`, dan keterbatasan.

   ```python
   !cd /content && zip -r inference_time.zip inference_time
   from google.colab import files; files.download("/content/inference_time.zip")
   ```

## Yang diukur

- (a) **generate**: hanya `model.generate(...)`, diapit `torch.cuda.synchronize()`.
- (b) **end-to-end**: membaca citra (PIL), *chat template*, *processor*, pemindahan ke GPU, generate,
  *decode*, *parsing* JSON, dan aturan SCS, juga diapit `torch.cuda.synchronize()`.
  Waktu memuat model dicatat terpisah di `lingkungan.json`.

## Catatan

- Jika label tidak 8/8 cocok dengan `predictions.csv`, `ringkasan.md` menuliskannya apa adanya.
  Penyebab yang mungkin: GPU atau versi pustaka berbeda dari Kaggle, atau revision adapter di Hub
  berbeda. Waktu inference tetap bisa dilaporkan, tetapi kesetaraan label perlu disebut tidak terbukti.
- Skrip berhenti jika *prompt* di dalamnya berbeda dari `vlm_experiments.json`.

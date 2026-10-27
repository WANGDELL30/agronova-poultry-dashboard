# Laporan Cek Leakage Split

Proyek AgroNovaAI (WP C) · KPI "Split minim leakage" · dijalankan 27 Oktober 2026

Berkas di folder ini:

- `leakage_check.py`: skrip read-only yang bisa dijalankan ulang (perintah di bagian 6).
- `leakage_details.csv`: rincian pelanggaran. Pada run ini **hanya berisi header** karena tidak ada pelanggaran.
- `leakage_summary.json`: semua angka mentah hasil run, termasuk sumber setiap file augmentasi.

## 1. Data dan metode

| Komponen | Sumber |
|---|---|
| Citra mentah (51) + COCO | `Raw Data Chicken Stress.zip` → `_tmp_raw/Data/{train,valid,test}` |
| Kode pembentuk sesi dan split | `executed-final-Manual Annotation Workflow/Executed/chickenstress-kaggle.ipynb` (cell 27: sesi, cell 29: instance, cell 31: split) |
| ID sesi tersimpan | `.../Executed/results/Data_working/session_id_mapping.csv` |
| Split final (crop) | `.../Executed/results/Data_working/dataset/{train,valid,test}/<kelas>/` |
| Ground truth 69 instance | `.../Manual Annotation - For Training/indicators_ground_truth_multi.csv` |

- **Sesi:** pHash dihitung ulang dari citra mentah, dengan logika yang sama dengan notebook. Dua citra digabung bila jarak Hamming ≤ ambang **atau** selisih timestamp `IMG_YYYYMMDD_HHMMSS` ≤ 120 detik, memakai Union-Find atas semua pasangan dari 51 citra.
- **Split per citra:** notebook tidak menyimpan tabel split per citra/instance (crop hanya dinamai `stress_0001.jpg`, dst.). Skrip merekonstruksinya dengan mencocokkan setiap crop non-augmentasi ke crop box representatif tiap instance (ukuran sama, kelas folder sama, selisih piksel terkecil).

## 2. Pemetaan nama file (langkah 1)

| Pemeriksaan | Hasil |
|---|---|
| Citra di zip vs `session_id_mapping.csv` | 51 = 51; tidak ada file yang hanya ada di salah satu sisi |
| Instance GT yang ada di COCO | 69 / 69 |
| Crop di `dataset/` yang terpetakan ke instance | 69 / 69, satu-satu, tanpa crop yatim |
| Citra sumber yang punya crop | 51 / 51 (12 citra punya lebih dari satu crop) |
| Sesi dari pHash citra mentah (ambang 10) vs sesi tersimpan | **Identik**: 32 sesi dengan anggota yang sama |

## 3. Hasil cek lintas split (langkah 2)

| Cek | Kriteria | Pelanggaran | Status |
|---|---|---:|---|
| a | Satu `id_sesi` muncul di lebih dari satu split (32 sesi) | 0 | Lulus |
| b | Satu citra sumber (dan semua crop turunannya) di lebih dari satu split (69 crop dari 51 citra) | 0 | Lulus |
| c | Pasangan citra dengan pHash ≤ 10 di split berbeda (ada 20 pasangan ≤ 10, semuanya dalam split yang sama) | 0 | Lulus |
| d | File augmentasi hanya di train dan citra sumbernya di train (6 file `aug_*`, semuanya di `train/not_stress`) | 0 | Lulus |

Margin terhadap ambang:

- Jarak pHash terkecil antara dua citra di split berbeda adalah **18**: `medium-4-_jpg…` (train) vs `high-24-_jpg…` (valid).
- Selisih timestamp terkecil antara dua citra di split berbeda adalah **498 detik**: `IMG_20250511_185049…` (train) vs `IMG_20250511_184231…` (test). Jarak pHash pasangan ini 22. Ini kasus batas (lihat bagian 5).

## 4. Uji sensitivitas ambang pHash (langkah 3)

Gap timestamp tetap 120 detik. Split asli dipertahankan.

| Ambang pHash | Jumlah sesi | Sesi berisi > 1 citra | Sesi jatuh lintas split | Sama dengan sesi tersimpan |
|---:|---:|---:|---:|---|
| 8 | 33 | 12 | 0 | Tidak: `high-19` lepas dari sesi {`high-16`, `high-19`, `high-20`} |
| **10** (dipakai) | **32** | 12 | **0** | Ya |
| 12 | 31 | 12 | 0 | Tidak: `high-18` bergabung ke sesi {`high-16`, `high-19`, `high-20`} |

Perubahan antar ambang hanya melibatkan `high-16`, `high-18`, `high-19`, dan `high-20`, dan keempatnya berada di train.

Ambang pHash harus dinaikkan sampai sekitar 18 sebelum ada pasangan lintas split yang tergabung lewat kemiripan visual. Gap timestamp juga baru menggabungkan citra lintas split bila dinaikkan ke ≥ 498 detik.

## 5. Jumlah sampel dan keterbatasan

| Split | Instance (crop) | Citra | Sesi | stress | not_stress | undefined | Crop augmentasi |
|---|---:|---:|---:|---:|---:|---:|---:|
| train | 52 | 34 | 21 | 29 | 11 | 12 | 6 |
| valid | 9 | 9 | 5 | 8 | 0 | 1 | 0 |
| test | 8 | 8 | 6 | 4 | 1 | 3 | 0 |
| **Total** | **69** | **51** | **32** | **41** | **12** | **16** | 6 |

Keterbatasan:

1. **ID sesi bersifat heuristik, bukan metadata asli.** Hasil bersih di atas berarti "tidak ditemukan leakage menurut heuristik ini" (pHash ≤ 10, timestamp ≤ 120 detik). Ini bukan jaminan bebas leakage.
2. **Ayam yang sama di sesi berbeda tidak dapat dideteksi.** Tidak ada ID individu ayam, kandang, atau kamera. Ekor yang sama yang difoto pada waktu lain dengan latar berbeda bisa masuk split berbeda tanpa terdeteksi.
3. **Kasus batas waktu.** `IMG_20250511_185049` (train) dan `IMG_20250511_184231` (test; split asal Roboflow: valid) diambil pada malam yang sama dengan selisih sekitar 8 menit. pHash-nya jauh (22), jadi tidak dianggap satu sesi, tetapi keduanya mungkin berasal dari kandang atau kelompok ayam yang sama.
4. **Hanya 19 dari 51 citra punya timestamp `IMG_YYYYMMDD_HHMMSS` di nama file.** 32 citra lainnya (seri `high-N`, `medium-N`, `low-N`, `sN`, dan sebagainya) hanya dikelompokkan lewat pHash.
5. **Sampel evaluasi sangat kecil:** test 8 instance (6 sesi), valid 9 instance (5 sesi). Valid tidak berisi `not_stress`, dan test hanya berisi 1 `not_stress`. Notebook juga memindahkan satu sesi (`session_0002`) dari train ke test agar `not_stress` terwakili.
6. **Split per citra adalah hasil rekonstruksi**, karena notebook tidak menyimpannya. Pencocokan crop unik untuk 69 dari 69 instance, dan label 8 crop test sama dengan `true_label` di `predictions.csv` hasil evaluasi.
7. pHash dihitung dengan `imagehash` 4.3.2 di lokal. Versi pustaka di Kaggle saat notebook dijalankan tidak tercatat, tetapi partisi sesi yang dihasilkan identik dengan `session_id_mapping.csv`.

## 6. Menjalankan ulang

Dari root repo, setelah zip diekstrak ke `_tmp_raw/`:

```bash
python -I docs/leakage_check/leakage_check.py \
  --raw "_tmp_raw/Data" \
  --work "../executed-final-Manual Annotation Workflow/Executed/results/Data_working" \
  --gt "../executed-final-Manual Annotation Workflow/Manual Annotation - For Training/indicators_ground_truth_multi.csv" \
  --out "docs/leakage_check"
```

Dependensi: `imagehash`, `Pillow`, `numpy`. Skrip hanya membaca data dan menulis tiga berkas keluaran di `--out`.

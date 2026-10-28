# Catatan verifikasi KPI 6

Tanggal: 2026-10-28. Tidak ada model yang dijalankan ulang. Semua angka dihitung langsung dari berkas di `results/`. Tidak ada berkas yang sudah ada yang diubah.

## 1. Berkas yang ditemukan

`results/vlm/evaluation/`
- `Zero-shot_VLM_SCS_prompt/`: `predictions.csv`, `classification_report.txt`, `confusion_matrix.png`
- `Fine-tuned_VLM_SCS_prompt_LoRA/`: `predictions.csv`, `classification_report.txt`, `confusion_matrix.png`
- `extended_metrics.csv` (balanced_accuracy, cohen_kappa, roc_auc, pr_auc, n_parse_error)
- `calibration_curves.png`, `comparison_bar_chart.png`
- Terkait: `results/vlm/vlm_experiments.json` (konfigurasi, ambang SCS 3/7 dan minimal 5 indikator terlihat), `results/vlm/pipeline_all_df.csv`

`results/cnn/evaluation/`
- `full_metrics_summary.csv` (hanya 2 baris: DINOv2 dan EfficientNetV2 satu tahap)
- `yolo_detector_metrics.json`
- `DINOv2_satu_tahap/` dan `EfficientNetV2_satu_tahap/`: `classification_report.txt`, `confusion_matrix.png`, `full_metrics.json`
- `YOLOv11_satu_tahap/`, `YOLOv11_+_DINOv2/`, `YOLOv11_+_EfficientNetV2/`, `YOLOv11_+_EnsembleDINOv2_EfficientNetV2/`: hanya `classification_report.txt` berisi "Tidak ada sampel yang cocok untuk dievaluasi."
- `calibration_curves.png`

Kode sumber evaluasi Old Workflow: `training/cnn-workflow/03_evaluate.ipynb`. Saya hanya membacanya untuk melihat definisi metrik dan keluaran sel yang tersimpan.

Old Workflow tidak punya `predictions.csv` per objek. Karena itu, metrik klasifikasinya tidak dapat dihitung ulang secara independen dan hanya dikutip dari berkas hasil.

## 2. Verifikasi silang VLM

Perhitungan berasal dari `true_label` dan `label` di `predictions.csv`, memakai skrip Python mandiri dan dicek ulang dengan `sklearn.metrics.classification_report(labels=[stress, not_stress, undefined], zero_division=0)`.

| Pemeriksaan | Target | Hasil hitung | Berkas sumber | Status |
|---|---|---|---|---|
| *Zero-shot* accuracy | 0,375 | 0,3750 (3/8) | `classification_report.txt`: 0,3750 | cocok |
| *Zero-shot* macro-F1 | 0,250 | 0,2500 | `classification_report.txt`: 0,2500 | cocok |
| *Zero-shot* P/R/F1 per kelas | – | stress 0/0/0; not_stress 0/0/0; undefined 0,60/1,00/0,75 | sama persis | cocok |
| *Zero-shot* support | 4/1/3 | stress 4, not_stress 1, undefined 3 | sama | cocok dengan acuan laporan |
| *Fine-tuned* semua metrik per kelas | 1,00 | 1,00 (P, R, Spec, F1 ketiga kelas) | `classification_report.txt`: 1,00 | cocok |
| *Fine-tuned* accuracy/macro-F1 | 1,00 | 1,0000/1,0000 | 1,0000/1,0000 | cocok |
| `extended_metrics.csv` balanced accuracy *zero-shot* | – | rata-rata recall = (0 + 0 + 1)/3 = 0,3333 | 0,3333 | cocok |
| `extended_metrics.csv` balanced accuracy *fine-tuned* | – | 1,0 | 1,0 | cocok |
| `extended_metrics.csv` n_parse_error | – | kolom `parse_error` kosong di semua 8 baris (kedua eksperimen) | 0,0 | cocok |

Tidak ada selisih angka. Ada beberapa hal yang perlu dicatat:

- **Specificity** tidak ada di `classification_report.txt` maupun `extended_metrics.csv`, jadi saya menghitungnya sendiri dengan rumus TN/(TN+FP) (*one-vs-rest*). Hasilnya untuk *zero-shot*: stress 4/4 = 1,00; not_stress 4/7 = 0,5714; undefined 3/5 = 0,60.
- **Precision kelas stress (*zero-shot*)** = 0/0 karena model tidak pernah memprediksi stress. Laporan sklearn menampilkannya sebagai 0,00 karena `zero_division=0`. Saya memakai konvensi yang sama supaya angkanya konsisten dengan berkas sumber, dan menandainya di tabel. Macro-F1 0,250 juga bergantung pada konvensi ini serta pada penyertaan ketiga kelas. Jika macro-F1 hanya dihitung atas kelas yang pernah diprediksi (not_stress dan undefined), hasilnya menjadi 0,375. Angka 0,375 itu **tidak** dipakai.
- **Specificity stress = 1,00 (*zero-shot*)** muncul hanya karena FP = 0, sehingga tidak boleh dibaca sebagai kinerja baik.
- `cohen_kappa` (*zero-shot* 0,1304), `roc_auc` (0,375), dan `pr_auc` (0,5) di `extended_metrics.csv` tidak saya hitung ulang karena di luar cakupan tugas. Dasar skor ROC/PR, kemungkinan kolom `score_stress`, juga tidak terdokumentasi di berkas hasil.
- **Label vs nama berkas:** `true_label` berasal dari `manual_annotation` dan sering berbeda dari nama folder. Contohnya, `not_stress_0003.jpg` berlabel stress, sedangkan `stress_0001.jpg` dan `stress_0002.jpg` berlabel undefined. Komposisi 4/3/1 dalam laporan sesuai dengan anotasi manual, bukan dengan nama folder.

## 3. Old Workflow (mAP, IoU, objek cocok, metrik klasifikasi)

**Test set:** 2 citra, 5 objek *ground truth*. Sumbernya keluaran `yolo.val(split="test")` di `03_evaluate.ipynb` ("all 2 5 ..."). Kelima objek berlabel not_stress menurut baris `source_split == test` di `results/vlm/pipeline_all_df.csv`. Jumlah objek di berkas ini sama (5 objek, 2 citra), tetapi berkas ini berasal dari folder VLM, jadi kesamaannya dengan `test_df` di notebook CNN adalah kesimpulan saya. Hal ini konsisten dengan seluruh objek cocok yang berkelas not_stress.

**Detektor YOLOv11** (`yolo_detector_metrics.json`): precision 0,0064; recall 0,6000; AP50 0,2795; AP75 0,2794; mAP50-95 0,2034; `missed_detection_rate_from_pipeline1` = NaN.

**IoU:** Tidak ada nilai IoU rata-rata yang tersimpan di berkas mana pun. IoU hanya dipakai sebagai ambang pencocokan (IoU ≥ 0,5, `evaluate_pipeline(iou_thresh=0.5)`). mAP50-95 sendiri merupakan rata-rata AP pada ambang IoU 0,50–0,95. Jadi, "IoU" hanya dapat dilaporkan sebagai ambang, bukan sebagai angka hasil.

| Eksperimen | Objek cocok (n) | Missed detection rate | Accuracy | F1-macro (header) | Macro avg F1 (tabel) |
|---|---|---|---|---|---|
| 1. YOLOv11 satu tahap | 0 | tidak tersimpan | – | – | – |
| 2. DINOv2 satu tahap | 2 | 0,6 (= 3 dari 5 terlewat) | 1,00 | 1,00 | 0,50 |
| 3. EfficientNetV2 satu tahap | 1 | 0,8 (= 4 dari 5 terlewat) | 1,00 | 1,00 | 0,50 |
| 4. YOLOv11 + DINOv2 | 0 | – | – | – | – |
| 5. YOLOv11 + EfficientNetV2 | 0 | – | – | – | – |
| 6. YOLOv11 + Ensemble | 0 | – | – | – | – |

Per kelas untuk eksperimen 2 dan 3 (`full_metrics.json`): not_stress P/R/F1 = 1,0/1,0/1,0 (support 2 dan 1); stress P/R/F1 = 0,0/0,0/0,0 dengan support 0; specificity_stress 1,0; specificity_not_stress NaN.

### Nilai NaN dan penyebabnya (dari kode dan keluaran di `03_evaluate.ipynb`)

| Nilai | Eksperimen | Penyebab |
|---|---|---|
| `cohen_kappa` | 2 dan 3 | y_true dan y_pred hanya berisi satu kelas (not_stress, n = 2 dan n = 1), sehingga kesepakatan harapan = 1 dan pembagian 0/0. Notebook mencatat `RuntimeWarning: invalid value encountered in scalar divide`. |
| `specificity_not_stress` | 2 dan 3 | TN + FP = 0 karena tidak ada objek kelas lain. Fungsi `specificity_per_class` mengembalikan NaN dalam kasus ini. |
| `roc_auc`, `pr_auc`, `brier_score`, `ece` | 2 dan 3 | Kode sengaja mengisi NaN jika `y_true_bin` hanya punya satu kelas (`if len(set(y_true_bin)) > 1 ... else nan`). |
| `missed_detection_rate_from_pipeline1` | YOLOv11 | Pipeline 1 tidak punya objek cocok, sehingga dilewati dan tidak masuk `full_metrics_summary`. Nilai `.get(..., nan)` menjadi NaN. Menurut rumus notebook (1 − cocok/total GT), nilainya seharusnya 1 − 0/5 = 1,0, tetapi angka ini **tidak tersimpan** di berkas. Ini hanya hitungan saya dan belum dimasukkan ke teks laporan. |

Kalimat "tidak dapat dihitung (n = 1–2)" sesuai dengan berkas sumber: n_matched = 2 (DINOv2) dan 1 (EfficientNetV2).

### Selisih atau inkonsistensi di berkas sumber Old Workflow

1. **F1-macro header 1,0000 vs macro avg 0,50 pada tabel** di `classification_report.txt` (DINOv2 dan EfficientNetV2). Header dihitung dengan `f1_score(y_true, y_pred, average="macro")` tanpa argumen `labels`, sehingga hanya kelas yang muncul (not_stress) yang dihitung dan hasilnya 1,0. Tabel memakai `labels=[not_stress, stress]` dan `zero_division=0`, sehingga F1 stress = 0 ikut dirata-rata dan hasilnya 0,50. `full_metrics.json` dan `full_metrics_summary.csv` memakai nilai header (1,0). Saya tidak menyamakannya. Untuk laporan, sebaiknya disebutkan bahwa accuracy = 1,00 hanya berlaku untuk 1–2 objek dari satu kelas, dan F1-macro tidak bermakna di sini.
2. **precision_stress = 0,0 dan specificity_stress = 1,0** pada eksperimen 2 dan 3 bukan hasil pengukuran, karena support stress = 0. Keduanya hanya artefak `zero_division=0` dan TN/(TN+0).
3. **Recall detektor YOLOv11 0,60 vs 0 objek cocok di pipeline 1.** `yolo.val()` memakai ambang *confidence* bawaan validasi Ultralytics yang sangat rendah, sedangkan pipeline memanggil `model(image_path)` dengan ambang prediksi bawaan. Ini **dugaan** penyebab perbedaan berdasarkan perilaku bawaan Ultralytics. Notebook tidak mencatat nilai ambang tersebut secara eksplisit.

## 4. Keterbatasan

- **n = 8 pada test VLM** (4/1/3). Kelas not_stress hanya berisi 1 sampel, sehingga recall/precision not_stress hanya bisa 0 atau 1. Satu prediksi yang berubah dapat menggeser accuracy sebesar 0,125. Hasil 1,00 untuk *fine-tuned* belum menunjukkan generalisasi. Tidak ada interval kepercayaan yang dihitung.
- **Old Workflow: test 2 citra / 5 objek**, dan metrik klasifikasi hanya tersedia pada n = 1–2 objek dari satu kelas.
- Test set VLM (8 crop) dan test set Old Workflow (2 citra utuh, 5 objek) **berbeda**, sehingga angka keduanya tidak dapat dibandingkan secara langsung.
- Old Workflow tidak menyimpan prediksi per objek, jadi angkanya dikutip dari berkas dan tidak dihitung ulang.

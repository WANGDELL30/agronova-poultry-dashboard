# Manifest Dataset: Chicken Stress Detection / Stressed Chicken (v19)

ID dokumen: ARG-03 · Proyek: AgroNovaAI (WP C), deteksi stres ayam dari citra
Tanggal akses yang dipakai laporan: 25 Oktober 2026

Berkas pendamping:

- `manifest_dataset.csv`: isi tabel di bawah dalam bentuk `kelompok, field, nilai, sumber`.
- `manifest_instance.csv`: satu baris per instance ayam (69 baris).

Semua field level dataset di bawah diambil hanya dari file di dalam `Raw Data Chicken Stress.zip` (`README.dataset.txt`, `README.roboflow.txt`, `_annotations.coco.json`) atau dihitung langsung dari isinya. Field yang tidak ada di sumber tersebut ditulis "TIDAK TERSEDIA (tidak ada di informasi publik dataset)".

## 1. Identitas dan lisensi

| Field | Nilai | Sumber |
|---|---|---|
| Nama proyek Roboflow | Stressed chicken | README.dataset.txt, README.roboflow.txt |
| Nama versi | Stressed chicken > 2025-10-11 4:57pm | README.dataset.txt |
| Workspace (slug URL) | `chicken-stress-detection` | URL di README.dataset.txt |
| Project (slug URL) | `stressed-chicken-vgdf1` | URL di README.dataset.txt |
| Nama tampilan workspace | TIDAK TERSEDIA (tidak ada di informasi publik dataset) | – |
| Versi | 19 | README.roboflow.txt; `info.version` di COCO |
| URL | https://universe.roboflow.com/chicken-stress-detection/stressed-chicken-vgdf1 | README.dataset.txt |
| Penyedia | "Provided by a Roboflow user" | README.dataset.txt |
| Nama pembuat / kontributor | TIDAK TERSEDIA (tidak ada di informasi publik dataset); `info.contributor` kosong | COCO |
| Sitasi / DOI | TIDAK TERSEDIA (tidak ada di informasi publik dataset) | – |
| Lisensi | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) | README.dataset.txt; `licenses` di COCO |
| Tanggal ekspor Roboflow | 20 Juli 2026, 06:37:39 UTC | README.roboflow.txt; `info.date_created` |
| Tanggal akses (laporan) | 25 Oktober 2026 | ditetapkan laporan, tidak berasal dari zip |
| Tanggal pengambilan citra | TIDAK TERSEDIA (tidak ada di informasi publik dataset) | – |

## 2. Berkas

| Field | Nilai |
|---|---|
| Nama arsip | `Raw Data Chicken Stress.zip` |
| Ukuran | 8.167.459 byte |
| SHA-256 | `3fc9c9c789e6ea760c77e1065f026513eaee627a9c9680074408e8661dc72304` |
| Isi | `Data/{train,valid,test}/` (JPG + `_annotations.coco.json`), `README.dataset.txt`, `README.roboflow.txt`, `Stressed chicken.v19i.coco.zip` |
| Konsistensi | `Stressed chicken.v19i.coco.zip` di dalam arsip berisi 56 file yang identik (MD5) dengan hasil ekstraksi di `Data/` |

## 3. Citra dan anotasi

| Field | Nilai | Sumber |
|---|---|---|
| Jumlah citra | 51 (train 47, valid 2, test 2) | README.roboflow.txt; dihitung |
| Format citra | JPG | dihitung |
| Resolusi | 640 × 640 piksel (seluruh 51 citra) | `width`/`height` di COCO |
| Resolusi asli sebelum resize | TIDAK TERSEDIA (tidak ada di informasi publik dataset) | – |
| Prapemrosesan | Auto-orientation (EXIF stripping); Resize to 640×640 (Stretch) | README.roboflow.txt |
| Augmentasi Roboflow | Tidak ada | README.roboflow.txt |
| Format anotasi | COCO JSON, satu `_annotations.coco.json` per split, bounding box | README.roboflow.txt; dihitung |
| Kategori COCO | `normal-stressed` (id 0, supercategory, 0 box), `high_stress`, `low_stress`, `medium_stress`, `normal` | `categories` di COCO |
| Pedoman anotasi Roboflow | TIDAK TERSEDIA (tidak ada di informasi publik dataset) | – |

Distribusi bounding box (dihitung dari `_annotations.coco.json`):

| Kelas | Train | Valid | Test | Total |
|---|---:|---:|---:|---:|
| normal | 48 | 3 | 5 | **56** |
| medium_stress | 28 | 0 | 0 | **28** |
| high_stress | 25 | 0 | 0 | **25** |
| low_stress | 10 | 0 | 0 | **10** |
| **Total** | 111 | 3 | 5 | **119** |

Komposisi kelas per citra: hanya high_stress 13, hanya medium_stress 12, hanya low_stress 4, hanya normal 18, low_stress + normal 3, medium_stress + normal 1.

## 4. Konteks pengambilan data

| Field | Nilai |
|---|---|
| Lokasi pengambilan | TIDAK TERSEDIA (tidak ada di informasi publik dataset) |
| Kamera / perangkat | TIDAK TERSEDIA (tidak ada di informasi publik dataset) |
| Jenis / strain ayam | TIDAK TERSEDIA (tidak ada di informasi publik dataset) |
| Umur ayam | TIDAK TERSEDIA (tidak ada di informasi publik dataset) |
| Kondisi kandang / lingkungan | TIDAK TERSEDIA (tidak ada di informasi publik dataset) |

Sebagian nama file mengikuti pola `IMG_YYYYMMDD_HHMMSS`. Pola ini hanya dipakai sebagai sinyal heuristik untuk ID sesi (bagian 6) dan tidak dicatat di sini sebagai tanggal pengambilan, karena tidak didokumentasikan oleh penyedia dataset.

## 5. Turunan penulis (level instance)

Sumber: `executed-final-Manual Annotation Workflow/Manual Annotation - For Training/indicators_ground_truth_multi.csv` (anotasi manual 7 indikator SCS per ekor), `Executed/results/Data_working/session_id_mapping.csv`, `label_balancing_log.csv`, dan folder `Executed/results/Data_working/dataset/`.

- **Instance:** 69 ekor. 119 box Roboflow digabung per ekor: dalam satu citra, box diurutkan dari area terbesar, lalu box yang tumpang tindih lebih dari 50% dengan kategori yang sama digabung (50 sub-box kepala ikut ke box badannya). Pengelompokan ini dihitung ulang dari COCO dan menghasilkan 69 `instance_key` yang sama persis dengan CSV.
- **Instance per kategori Roboflow asal:** normal 35, medium_stress 14, high_stress 13, low_stress 7.
- **Label akhir (tiga kelas):** stress 41, not_stress 12, undefined 16.
- **Sesi heuristik:** 32 sesi (12 di antaranya berisi lebih dari satu citra).

Split final model (dipakai untuk pelatihan/evaluasi, level sesi, 70/15/15, `SEED = 42`):

| Split | Instance | stress | not_stress | undefined | Citra | Sesi |
|---|---:|---:|---:|---:|---:|---:|
| train | 52 | 29 | 11 | 12 | 34 | 21 |
| valid | 9 | 8 | 0 | 1 | 9 | 5 |
| test | 8 | 4 | 1 | 3 | 8 | 6 |
| **Total** | **69** | **41** | **12** | **16** | **51** | **32** |

Catatan split:

- Kolom `split` di CSV ground truth adalah **split asli Roboflow** (train 65, valid 2, test 2 instance). Di `manifest_instance.csv` nilai itu disimpan di kolom `split_roboflow_asal`.
- Split final per instance tidak disimpan sebagai tabel oleh notebook; crop hanya diberi nama berurutan (`stress_0001.jpg`, dst.). Kolom `split` di `manifest_instance.csv` **direkonstruksi**: crop box representatif tiap instance dihitung ulang dari citra kerja dan dicocokkan dengan file crop di `Data_working/dataset/{train,valid,test}/` (ukuran sama dan kelas folder sama, lalu selisih piksel rata-rata terkecil). Hasilnya: 69 dari 69 crop cocok satu-satu (selisih piksel rata-rata maksimum 4,7 dari 255, karena kompresi JPEG), tidak ada satu sesi pun yang terbagi ke dua split, dan label 8 crop test sama dengan `true_label` di `evaluation_results/.../predictions.csv`. Enam file `aug_*` di `train/not_stress` adalah augmentasi dan bukan instance baru.
- Notebook mencatat bahwa `session_0002` dipindahkan dari train ke test agar kelas `not_stress` terwakili di test.
- Nama folder crop (`stress`/`not_stress`) adalah label biner sesi dari kategori Roboflow, bukan `label_akhir`. Label yang dipakai sebagai target adalah anotasi manual.

## 6. Verifikasi aturan label

Aturan SCS: kurang dari 5 indikator terlihat → `undefined`; 3 atau lebih `YA` → `stress`; selain itu → `not_stress`. Instance yang menyimpang dari aturan, atau yang ketujuh indikatornya `TIDAK`, diberi status `PERLU_VERIFIKASI`. Label tidak diubah.

Hasil: 67 OK, 2 PERLU_VERIFIKASI.

| instance_id | instance_key | Terlihat | YA | label_akhir | Split final | Alasan |
|---|---|---:|---:|---|---|---|
| INST-066 | `train/s4_jpg.rf.a2b66a0923228b230c9b84860ecb7b48.jpg#inst1` | 4 | 4 | stress | train | Hanya 4 indikator terlihat; menurut aturan seharusnya `undefined` |
| INST-068 | `valid/IMG_-_-_jpg.rf.ac466c0d3196deb463c628abc21cf3fb.jpg#inst0` | 7 | 0 | not_stress | test | Ketujuh indikator `TIDAK` (label sesuai aturan, ditandai untuk dicek ulang) |

## 7. Verifikasi silang

| Pemeriksaan | Acuan laporan | Hasil hitung | Status |
|---|---|---|---|
| Jumlah citra di zip | 51 | 51 (JSON 51 = JPG 51) | Cocok |
| Jumlah box | 119 | 119 | Cocok |
| Box normal / medium / high / low | 56 / 28 / 25 / 10 | 56 / 28 / 25 / 10 | Cocok |
| Baris CSV ground truth | 69 | 69 (semua `excluded = 0`) | Cocok |
| Label stress / not_stress / undefined | 41 / 12 / 16 | 41 / 12 / 16 | Cocok |
| Split | tidak ada angka acuan di permintaan | final: train 52, valid 9, test 8; Roboflow asal: train 65, valid 2, test 2 | Final cocok dengan isi folder crop (train 58 − 6 aug = 52, valid 9, test 8) |
| Resolusi | – | 640 × 640 untuk semua citra | – |

## 8. Keterbatasan

1. Manifest level dataset hanya memakai informasi publik dataset Roboflow yang ikut dalam arsip ekspor (README dan file COCO). Lokasi, kamera, jenis dan umur ayam, tanggal pengambilan, serta identitas pembuat tidak tersedia di sumber tersebut dan tidak diisi dengan dugaan.
2. ID sesi dibuat secara heuristik, bukan dari metadata pengambilan data. Dua citra digabung ke sesi yang sama bila jarak Hamming perceptual hash (pHash) ≤ 10, **atau** bila keduanya punya timestamp `IMG_YYYYMMDD_HHMMSS` di nama file dengan selisih ≤ 120 detik. Penggabungan dilakukan dengan Union-Find di seluruh 51 citra. Pengelompokan ini bisa salah gabung atau salah pisah.
3. Anotasi per ekor (7 indikator SCS) dan label tiga kelas (`stress`, `not_stress`, `undefined`) adalah hasil kerja penulis, bukan bagian dari dataset Roboflow. Kategori Roboflow asal hanya disimpan sebagai referensi.
4. Split final per instance direkonstruksi dengan mencocokkan crop (bagian 5) karena notebook tidak menyimpan tabel split per instance. Pencocokan ini unik untuk 69 instance, tetapi tetap hasil rekonstruksi.
5. Tanggal akses 25 Oktober 2026 berasal dari laporan. Arsip ini sendiri diekspor dari Roboflow pada 20 Juli 2026.

# Perubahan Laporan Akhir: KPI 2 (Manifest) dan KPI 3 (Leakage)

Tanggal: 27 Oktober 2026

- File yang diubah: `Argama Vanesa_Laporan_Akhir_Magang_Riset_DSC_KKG.docx` (root repo).
- Cadangan sebelum edit: `Argama Vanesa_Laporan_Akhir_Magang_Riset_DSC_KKG_backup_sebelum_KPI2-3.docx` (MD5 `337ed7d9865285551a7e3acf3a5e9480`, sama dengan file sebelum edit).
- Sumber angka (dibaca dari disk): `docs/manifest/manifest_dataset.md`, `docs/manifest/manifest_instance.csv`, `docs/leakage_check/leakage_report.md`, `docs/leakage_check/leakage_summary.json`.

Edit dilakukan langsung pada `word/document.xml`, per paragraf dan per run. Istilah asing memakai run miring (`<w:i/><w:iCs/>`) dan label status memakai run tebal, sama seperti konvensi dokumen. Ukuran huruf sel tabel dipertahankan (sz 20 untuk Tabel 4.1, sz 22 untuk Tabel 4.2, 5.1, dan Lampiran 11). Tidak ada tabel, gambar, caption, atau heading yang ditambah atau diubah.

## 1. Lokasi yang diubah

| No | Lokasi | Sebelum | Sesudah |
|---|---|---|---|
| 1 | Ringkasan Eksekutif | "Lima dari delapan KPI tercapai dan tiga tercapai sebagian." | "Tujuh dari delapan KPI tercapai dan satu tercapai sebagian." Angka dihitung dari kolom Realisasi Tabel 4.1 setelah edit: KPI 1–5, 7, dan 8 Tercapai; KPI 6 Sebagian. Bagian abstrak lain tidak diubah. |
| 2 | Bab 3.2, butir "Praproses dan pembagian data" | "... lalu data dibagi per sesi untuk menekan *leakage*." | Ditambah klausa "... dan hasil pembagiannya diperiksa ulang terhadap *leakage* lintas *split*." Kalimat lain tetap. |
| 3 | Subbab 4.1.2, paragraf kedua | Kalimat "Dokumen *manifest* formal belum dibuat, sehingga CSV ini menjadi dasarnya [PERIKSA: dua *instance* meragukan ...]" | Kalimat dan tag dihapus. Kalimat pertama paragraf ("Label manual tidak selalu sejalan ...") dipertahankan. Ditambah tiga paragraf: (a) *manifest* dua level (lokasi `docs/manifest`, sumber Roboflow "Stressed chicken" v19, URL, CC BY 4.0, ekspor 20 Juli 2026, 51 citra 640 × 640, COCO, 119 box dan distribusinya, kolom manifest instance); (b) hanya informasi publik Roboflow + daftar field TIDAK TERSEDIA + ID sesi, anotasi per ekor, dan label tiga kelas sebagai hasil kerja penulis; (c) keputusan INST-066 dan INST-068 beserta alasan dan keterbatasannya. |
| 4 | Subbab 4.1.3, paragraf pertama | "Jumlah *crop not stress* dan *stress* per *split* adalah 23 (menjadi 29 setelah augmentasi) dan 29 pada *train*, 2 dan 7 pada *valid*, serta 3 dan 5 pada *test*." | Angka tidak diubah, dasarnya dinyatakan eksplisit: "Berdasarkan folder *crop* final, yang dinamai menurut label biner sesi dari kategori Roboflow, ...". Ditambah komposisi menurut label manual tiga kelas (lihat bagian 2). |
| 5 | Subbab 4.1.3, paragraf baru (3) | – | (a) Rekonstruksi *split* final (69/69 *crop*; 8 *crop test* = `true_label`), 52/9/8 *instance* (21/5/6 sesi), kolom `split` CSV *ground truth* = *split* asli Roboflow (65/2/2), dan sesi dari citra mentah identik dengan `session_id_mapping.csv` (32 sesi); (b) empat cek, semuanya 0 pelanggaran, margin pHash 18 dan *timestamp* 498 detik, serta sensitivitas 8/10/12 → 33/32/31 sesi, 0 lintas *split*; (c) rumusan "tidak ditemukan *leakage* menurut heuristik sesi", keterbatasan, kasus batas IMG_20250511_185049/184231 (pHash 22), dan ukuran *valid*/*test*. |
| 6 | Tabel 4.1, baris KPI 2 | Realisasi: "**Sebagian.** Sumber, 51 citra, 119 *bounding box*, dan 69 *instance* tercatat; *manifest* formal belum ada [PERIKSA: dasar CSV *ground truth*]". Bukti: "Subbab 4.1.2" | Realisasi: "**Tercapai.** *Manifest* dua level (dataset dan 69 *instance*) tersedia dan angkanya cocok dengan data; hanya memuat informasi publik Roboflow". Bukti: "Subbab 4.1.2; docs/manifest". Capaian tetap "–". |
| 7 | Tabel 4.1, baris KPI 3 | Realisasi: "**Sebagian.** *Split* per sesi (32 sesi), tetapi ID sesi heuristik karena metadata asli tidak tersedia". Bukti: "Subbab 4.1.3" | Realisasi: "**Tercapai.** Empat pemeriksaan *leakage* tanpa pelanggaran (32 sesi); hasil bersih menurut ID sesi heuristik, bukan metadata asli". Bukti: "Subbab 4.1.3; docs/leakage_check". Capaian tetap "–". |
| 8 | Tabel 4.2, baris ARG-03 | Lokasi: "Repositori proyek (CSV *ground truth*)". Status: "Sebagian [PERIKSA: *manifest* formal belum ada]" | Lokasi: "Repositori kode (docs/manifest: manifest_dataset.md, manifest_dataset.csv, manifest_instance.csv)". Status: "Selesai". Tanggal serah terima [ISI] tidak diubah. |
| 9 | Subbab 5.1, paragraf pertama | "Lima KPI tercapai dan tiga tercapai sebagian. ... KPI yang tercapai sebagian berkaitan dengan data dan evaluasi ..." | "Tujuh KPI tercapai dan satu tercapai sebagian." Daftar KPI tercapai ditambah *manifest* dataset dan pembagian per sesi yang lolos pemeriksaan *leakage*. KPI sebagian dijelaskan sebagai konsistensi metrik (mAP/IoU hanya Old Workflow; *inference time* VLM berupa estimasi), sesuai Realisasi KPI 6 di Tabel 4.1. Ditambah kalimat bahwa KPI 2 dan 3 tercapai dengan catatan keterbatasan. |
| 10 | Tabel 5.1, baris pertama, kolom Solusi | "ID sesi heuristik; beralih ke VLM pralatih + LoRA" | "ID sesi heuristik; pemeriksaan *leakage* tidak menemukan pelanggaran; beralih ke VLM pralatih + LoRA". Status tetap "Sebagian". |
| 11 | Subbab 6.1, butir 2 | "Dataset terdokumentasi: ...; *manifest* formal belum dibuat dan dua *instance* perlu diverifikasi." | "Dataset terdokumentasi dalam *manifest* dua level: ...; dua *instance* yang menyimpang dicatat beserta keputusan mempertahankan labelnya." |
| 12 | Subbab 6.1, butir 3 | "Data dibagi per sesi (32 sesi) untuk menekan *leakage*, tetapi ID sesi masih heuristik ..." | "Data dibagi per sesi (32 sesi) untuk menekan *leakage*, dan pemeriksaan *leakage* tidak menemukan sesi, citra, *near-duplicate*, maupun augmentasi yang lintas *split*; ID sesi tetap heuristik karena metadata sesi asli tidak tersedia." |
| 13 | Lampiran 11, baris "Data dan metadata" | "... log *blur* dan *sharpening*; artefak *pipeline*" | Ditambah "; *manifest* dataset dan *instance* (docs/manifest); pemeriksaan *leakage* berupa skrip leakage_check.py, leakage_report.md, leakage_details.csv, dan leakage_summary.json (docs/leakage_check)". |

## 2. Verifikasi komposisi per split

Dihitung dari `docs/manifest/manifest_instance.csv` (69 baris).

| Split | (i) Folder *crop* final: not_stress / stress | (ii) Label manual: not_stress / stress / undefined | Instance | Sesi |
|---|---|---|---:|---:|
| train | 23 / 29 (not_stress 29 setelah 6 augmentasi) | 11 / 29 / 12 | 52 | 21 |
| valid | 2 / 7 | 0 / 8 / 1 | 9 | 5 |
| test | 3 / 5 | 1 / 4 / 3 | 8 | 6 |

- Angka lama di 4.1.3 cocok persis dengan dasar (i). Nama folder *crop* adalah label biner sesi yang diturunkan dari kategori Roboflow (`label_balancing_log.csv`), bukan label manual. Angka lama dipertahankan dan dasarnya dinyatakan eksplisit.
- Dasar (ii) cocok dengan 4.1.5 (*test*: 1 *not stress*, 4 *stress*, 3 *undefined*) dan dengan `leakage_report.md`.
- Total kedua dasar 69. *Split* Roboflow asal: train 65, valid 2, test 2.

## 3. Konflik angka dan teks

- **4.1.3 vs 4.1.5:** bukan konflik data, melainkan perbedaan dasar label (lihat bagian 2). Diselesaikan dengan menyebut dasarnya. Tidak ada tag [PERIKSA] baru.
- **Status KPI 2 dan 3:** teks lama "Sebagian" diganti "Tercapai" sesuai status baru. Akibatnya jumlah KPI di abstrak dan 5.1 berubah dari 5/3 menjadi 7/1.
- **Penjelasan KPI sebagian di 5.1:** teks lama menyebut KPI sebagian "berkaitan dengan data dan evaluasi". Setelah KPI 2 dan 3 tercapai, hanya KPI 6 (metrik) yang tersisa, jadi penjelasannya diganti sesuai Realisasi KPI 6.
- **Dua instance PERLU_VERIFIKASI:** teks lama menyebut keduanya "perlu diverifikasi". Di lokasi edit, teks ini diganti keputusan penulis (label dipertahankan). Masih ada tiga kemunculan di luar cakupan (bagian 4).

## 4. Butir terbuka (perlu keputusan penulis)

1. **Ringkasan Eksekutif:** masih ada frasa "... dan dua *instance* label masih perlu diverifikasi" serta rekomendasi "memverifikasi label yang meragukan". Tidak diubah karena instruksinya hanya mengubah kalimat jumlah KPI. Frasa ini bertentangan dengan keputusan di 4.1.2 dan 6.1.
2. **Tabel 6.1 (Saran), baris Kelanjutan proyek:** "Memverifikasi dua *instance ground truth* yang meragukan lalu mengulang training dan evaluasi". Tidak diubah karena di luar daftar lokasi. Bisa dipertahankan sebagai saran verifikasi independen atau dirumuskan ulang.
3. **Lampiran 9, B19:** "Dua *instance ground truth* meragukan — Belum: perlu verifikasi manual". Tidak diubah. Statusnya bisa diganti menjadi "Diputuskan: label dipertahankan (lihat 4.1.2)".
4. **Lampiran 4, baris 3:** "Guideline anotasi, CSV *ground truth*, dan laporan pengembangan". *Manifest* dan pemeriksaan *leakage* belum disebut di berita acara serah terima, dan tautannya masih [ISI].
5. **Subbab 5.1, paragraf ketiga:** menyebut satu-satunya sampel *not stress* pada *test* bernilai semua TIDAK. Ini sesuai dengan INST-068 dan tidak diubah.
6. **Daftar isi dan nomor halaman:** enam paragraf baru dapat menggeser halaman. Perbarui *field* (Ctrl+A lalu F9 di Word) sebelum ekspor PDF. Field "DAFTAR TABEL" masih bertuliskan "No table of contents entries found." sejak sebelum edit.

## 5. Hasil verifikasi dokumen

| Pemeriksaan | Sebelum | Sesudah |
|---|---|---|
| Tabel (`w:tbl`) | 39 | 39 |
| *Drawing* | 3 | 3 |
| Caption tabel / gambar | 13 / 9 | 13 / 9 |
| Heading | 49 | 49 (teks identik) |
| *Field* TOC | 4 | 4 |
| Isian [ISI] | 69 | 69 |
| Paragraf | 1.040 | 1.046 (+6 paragraf prosa) |
| "manifest formal belum", "Lima KPI tercapai dan tiga", "Lima dari delapan" | ada | 0 |
| Tag [PERIKSA] terkait KPI 2/3 | 3 | 0 |
| Validasi XSD (`validate.py --original`) | – | PASSED |

Tag [PERIKSA] yang tersisa tidak terkait KPI 2/3 dan tidak diubah:

- [PERIKSA: di luar periode resmi] di Tabel 3.1 dan Tabel 3.3
- [PERIKSA: tanggal fine-tuning v5 dan evaluasi 8 sampel tidak tercatat] di Tabel 3.3
- [PERIKSA: nama pembimbing] di Tabel 3.4

Dokumen tidak dirender ke PDF karena LibreOffice tidak tersedia di mesin ini. Tampilan sebaiknya diperiksa sekali di Word.

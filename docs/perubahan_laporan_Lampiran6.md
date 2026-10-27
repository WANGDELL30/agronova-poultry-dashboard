# Perubahan Laporan Akhir: Lampiran 6 (Pernyataan Penggunaan Alat AI)

Tanggal: 27 Oktober 2026

- File yang diubah: `Argama Vanesa_Laporan_Akhir_Magang_Riset_DSC_KKG.docx` (root repo). File ini kecocokan pola yang paling baru dimodifikasi; kecocokan lain hanya file cadangan.
- Cadangan sebelum edit: `Argama Vanesa_Laporan_Akhir_Magang_Riset_DSC_KKG_backup_sebelum_Lampiran6.docx` (MD5 `cb90ea9f93d5b5c1066316904e3a2421`, sama dengan file sebelum edit).
- Lokasi: tabel tepat di bawah heading badan lampiran "Lampiran 6. Pernyataan Penggunaan Alat AI" (gaya `JudulLampiran`), bukan entri daftar isi.

## 1. Apa yang diubah

| Bagian | Sebelum | Sesudah |
|---|---|---|
| Header tabel | Alat AI \| Tujuan penggunaan \| Bagian laporan atau pekerjaan \| Cara verifikasi oleh peserta | Tidak diubah (tebal, latar E7E6E6, diulang di setiap halaman) |
| Baris data 1 | [ISI: alat AI] \| [ISI: tujuan penggunaan] \| [ISI: bagian laporan atau pekerjaan] \| [ISI: cara verifikasi] | ChatGPT \| Membantu menyusun draf proposal penelitian sebelum pengkodean dimulai. \| Proposal penelitian (tahap awal magang). \| Isi proposal dibaca dan disesuaikan oleh peserta dengan parameter institusi dan acuan ilmiah yang dipakai (Schlegel et al., 2024) sebelum menjadi dasar pekerjaan. |
| Baris data 2 | [ISI] \| [ISI] \| [ISI] \| [ISI] | Claude \| Menulis kode berdasarkan gambaran alur kasar dan keputusan desain dari peserta. Mencakup juga skrip *manifest* dataset dan pemeriksaan *leakage*. \| *Notebook* Old Workflow dan New Workflow, serta skrip pada docs/manifest dan docs/leakage_check. \| Kode dijalankan sendiri oleh peserta dan hasilnya dibaca dari keluaran *notebook*. Kegagalan dicatat dan diperbaiki (Lampiran 9). Keluaran skrip dicocokkan dengan angka acuan (51 citra, 119 *bounding box*, 69 *instance*, 41/12/16). |
| Baris data 3 | – (belum ada) | Baris baru hasil *deep copy* baris data 2 (`paraId` diperbarui). ChatGPT, kemudian Claude \| Membantu menyusun, menyunting, dan mengaudit laporan akhir. Draf awal dibuat dengan ChatGPT, penyusunan selanjutnya dengan Claude. \| Seluruh bab laporan. \| Setiap angka dan klaim dicocokkan dengan *notebook*, CSV *ground truth*, hasil evaluasi, dan repositori. Klaim yang belum terverifikasi ditandai [PERIKSA] sampai dipastikan. |
| Paragraf penutup | – (tabel langsung diikuti heading Lampiran 7) | Paragraf baru di antara tabel dan heading Lampiran 7: "Peserta merancang alur kerja, mengambil keputusan teknis (termasuk peralihan ke *vision-language model* atas persetujuan pembimbing), menyusun *guideline* anotasi dan *ground truth* manual, menjalankan eksperimen, serta bertanggung jawab atas isi laporan. Tidak ada alat AI lain yang digunakan." |

Catatan format:

- Isi sel memakai ukuran 11 pt (sz 22), sama dengan placeholder sebelumnya dan header tabel. Font mengikuti default dokumen (Times New Roman).
- *Highlight* kuning pada placeholder [ISI] dihapus.
- Lebar kolom (2200 / 2004 / 2100 / 2200 dxa), border, dan margin sel tidak berubah.
- Istilah asing dimiringkan; ChatGPT dan Claude tidak.
- Tanda `` ` `` di sekitar `docs/manifest` dan `docs/leakage_check` pada teks masukan tidak ikut ditulis. Path ditulis polos, sama seperti di subbab 4.1.2, 4.1.3, dan Lampiran 11.
- Paragraf penutup memakai format paragraf isi setelah tabel yang sudah ada di lampiran lain (spasi sebelum 10 pt, rata kiri-kanan, tanpa *style* khusus), sama seperti "Rekap kehadiran" di Lampiran 3.

## 2. Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| [ISI] di Lampiran 6 | Tidak ada lagi (total [ISI] dokumen 69 → 61; berkurang 8 dari dua baris data) |
| Isi tabel | 1 header + 3 baris data, 4 kolom |
| Jumlah tabel / *drawing* seluruh dokumen | 39 / 3, sama dengan sebelum edit |
| Bagian sebelum tabel Lampiran 6 | Byte-identik dengan cadangan |
| Lampiran 7 sampai akhir dokumen | Byte-identik dengan cadangan; heading Lampiran 7 tetap tepat setelah paragraf penutup |
| Validasi XSD (`validate.py --original`) | PASSED (paragraf 1.046 → 1.051: 4 sel baris baru + 1 paragraf penutup) |
| "[PERIKSA]" pada baris 3 | Hanya teks literal di sel "Cara verifikasi" baris 3. Bukan penanda baru: tidak ber-*highlight* dan tidak berisi catatan tindak lanjut. |

Karena teks literal itu, pencarian "[PERIKSA" di seluruh dokumen kini menghasilkan 5 kecocokan: 4 penanda lama yang tidak terkait dan 1 teks literal di Lampiran 6. Penanda lama yang tersisa: "di luar periode resmi" (Tabel 3.1 dan 3.3), "tanggal fine-tuning v5 dan evaluasi 8 sampel tidak tercatat" (Tabel 3.3), dan "nama pembimbing" (Tabel 3.4).

## 3. Penyebutan alat AI atau "Lampiran 6" di tempat lain

Tidak ada yang diubah. Tidak ada teks yang menyebut alat AI selain ChatGPT dan Claude, dan tidak ditemukan kontradiksi dengan tabel.

| Lokasi | Teks | Catatan |
|---|---|---|
| Lembar Pernyataan Keaslian, butir 2 | "Setiap penggunaan alat Kecerdasan Artifisial (AI) dalam penyusunan laporan maupun pekerjaan proyek telah saya nyatakan secara jujur pada Lampiran 6." | Konsisten. Rujukan Lampiran 6 benar. |
| Daftar Isi / Daftar Lampiran | "Lampiran 6. Pernyataan Penggunaan Alat AI" | Entri *field* TOC, tidak diubah. |
| Subbab 1.5 Sistematika Laporan | "... pernyataan penggunaan AI ..." | Konsisten. |
| Sampul, Tabel 1.1, Lembar Pernyataan | "AI / Machine Learning (Computer Vision)" | Nama bidang penugasan, bukan alat AI. |
| Tabel 4.2, ARG-09 | "Model AI" | Jenis deliverable, bukan alat AI. |

## 4. Perlu keputusan penulis

- Baris 3 menyebut klaim yang belum terverifikasi "ditandai [PERIKSA] sampai dipastikan". Laporan masih memuat 4 penanda [PERIKSA] aktif (lihat bagian 2). Kalimat ini tetap benar selama penanda itu ada, tetapi jika laporan final menghapus semua penanda, kalimat ini sebaiknya dibaca sebagai deskripsi proses.

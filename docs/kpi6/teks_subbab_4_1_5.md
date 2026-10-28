# Draf teks Subbab 4.1.5 (KPI 6, metrik konsisten)

Catatan untuk penempelan: istilah asing ditandai `*...*` agar dimiringkan di Word. Angka berasal dari `results/vlm/evaluation/` dan `results/cnn/evaluation/`; rincian perhitungan ada di `metrik_per_kelas.md` dan `catatan_verifikasi.md`.

---

## (i) Pengganti placeholder [ISI] untuk VLM *zero-shot*

Pada *test set* yang berisi 8 sampel (4 *stress*, 3 *undefined*, dan 1 *not stress*), VLM *zero-shot* dengan *prompt* SCS mencapai *accuracy* 0,375 dan *macro*-F1 0,250. Untuk kelas *stress*, *precision* bernilai 0,00, *recall* 0,00, *specificity* 1,00, dan F1 0,00. Untuk kelas *not stress*, *precision* bernilai 0,00, *recall* 0,00, *specificity* 0,57, dan F1 0,00. Untuk kelas *undefined*, *precision* bernilai 0,60, *recall* 1,00, *specificity* 0,60, dan F1 0,75.

Saya menghitung nilai tersebut dari *confusion matrix* hasil prediksi dengan pendekatan *one-vs-rest*. Dari empat sampel *stress*, tiga diprediksi sebagai *not stress* dan satu sebagai *undefined*. Satu sampel *not stress* diprediksi sebagai *undefined*, sedangkan ketiga sampel *undefined* diprediksi dengan benar. Dengan demikian, hanya 3 dari 8 prediksi yang benar (*accuracy* 3/8 = 0,375). Model tidak pernah memprediksi kelas *stress*, sehingga *precision* kelas ini secara matematis 0/0. Saya menuliskannya sebagai 0,00 sesuai konvensi *zero_division* = 0 pada *classification report*. *Specificity* 1,00 pada kelas *stress* juga hanya muncul karena tidak ada positif palsu, bukan karena model mampu mengenali ayam stres. Sebaliknya, VLM *fine-tuned* (SCS + LoRA) memprediksi kedelapan sampel dengan benar, sehingga *precision*, *recall*, *specificity*, dan F1 bernilai 1,00 untuk ketiga kelas. Karena *test set* hanya berisi 8 sampel, terutama 1 sampel *not stress*, angka-angka ini saya anggap indikatif dan belum dapat digeneralisasi.

## (ii) Cakupan mAP/IoU dan metrik klasifikasi

Metrik deteksi objek, yaitu mAP dan IoU, hanya saya laporkan untuk *Old Workflow*. Alasannya, hanya alur tersebut yang menghasilkan kotak pembatas (*bounding box*) untuk dicocokkan dengan *ground truth*. Pada *Old Workflow*, prediksi dianggap cocok dengan objek *ground truth* jika IoU ≥ 0,5. Detektor YOLOv11 pada *test set* (2 citra, 5 objek) memperoleh AP50 0,280, AP75 0,279, dan mAP50-95 0,203, dengan *precision* 0,006 dan *recall* 0,600. VLM tidak mendeteksi objek. VLM mengklasifikasi setiap *crop* ayam yang sudah tersedia, sehingga mAP dan IoU tidak berlaku untuknya. Sebaliknya, metrik klasifikasi (*accuracy*, *precision*, *recall*, *specificity*, F1, dan *macro*-F1) berlaku untuk semua model. Pada *Old Workflow*, metrik ini hanya dihitung pada objek yang berhasil dicocokkan, yaitu 2 objek untuk DINOv2 satu tahap dan 1 objek untuk EfficientNetV2 satu tahap. Empat konfigurasi lain, yaitu YOLOv11 satu tahap dan tiga konfigurasi dua tahap berbasis YOLOv11, tidak memiliki objek yang cocok. Karena itu, metrik klasifikasinya tidak dapat dihitung.

## (iii) Keterangan nilai NaN

Nilai NaN pada *Old Workflow* (*Cohen's kappa*, *specificity* kelas *not stress*, ROC-AUC, PR-AUC, *Brier score*, dan ECE) menandakan bahwa metrik tersebut tidak dapat dihitung. Penyebabnya, seluruh objek yang cocok (n = 1–2) berasal dari satu kelas, yaitu *not stress*.

# Kebutuhan Deployment Modul Deteksi Stres Ayam

Ringkasan tanya jawab tentang kebutuhan GPU, deployment ke Vercel, deployment server inferensi di
institusi, integrasi kamera IoT, dan temporal gate (voting). Isi dokumen ini mengacu pada kondisi kode di repo per
28 Oktober 2026.

## 1. Bagian mana yang butuh GPU?

GPU dibutuhkan di **server inferensi**, bukan di kamera.

```
Kamera / upload manual
      │  (hanya kirim gambar JPEG/PNG)
      ▼
Browser (web /vision, Next.js di Vercel)
      │  POST /api/v1/vision/frames
      ▼
API NestJS (apps/api)               ← server biasa, tanpa GPU
      │  POST /v1/classify  (INFERENCE_URL)
      ▼
Inference FastAPI (apps/inference)  ← DI SINI GPU DIBUTUHKAN
   Qwen3-VL-4B + LoRA, peak VRAM 8,7 GB (terukur di T4, fp16)
```

- **Kamera** hanya mengambil foto lalu mengirimnya. Tidak perlu GPU.
- **API NestJS** meneruskan gambar ke server inferensi, menyimpan file gambar, dan menjalankan
  voting 5 frame per kamera. Server biasa sudah cukup.
- **Server inferensi** memuat model VLM 4B, jadi butuh GPU NVIDIA. Di CPU, satu gambar bisa
  makan waktu puluhan menit.

## 2. Kenapa deteksi stres di Vercel belum real?

Yang di-deploy ke Vercel hanya **frontend `apps/web`**. API NestJS dan server inferensi tidak ikut
di-deploy, jadi halaman `/vision` di Vercel tidak punya backend sampai `NEXT_PUBLIC_API_BASE_URL`
diisi dengan URL API `https:` yang publik. Build produksi Vercel (`VERCEL_ENV=production`) **gagal**
jika variabel ini kosong atau bukan `https:`. Build lain (lokal atau preview) hanya memberi
peringatan, dan jika variabelnya kosong, dashboard menampilkan status "API belum dikonfigurasi" tanpa
mengirim request ke origin Vercel sendiri.

Vercel juga tidak bisa dipakai untuk menjalankan model ini:

- Vercel tidak menyediakan GPU.
- Function serverless punya batas ukuran dan durasi, sedangkan model ini berukuran beberapa GB dan
  butuh sekitar 38 detik untuk loading di T4 (ditambah sekitar 2 menit unduhan saat pertama kali).
- API NestJS menyimpan hasil di memori dan menulis file ke `apps/api/data/`. Keduanya butuh proses
  yang terus hidup, sedangkan function serverless di Vercel tidak bertahan lama.

## 3. Langkah membuat deteksi stres real

Vercel tetap dipakai untuk frontend. Tambahkan dua komponen di luar Vercel.

### A. Server inferensi di mesin GPU

- **Demo atau gratis:** Colab dengan GPU T4 lewat
  `apps/inference/colab/run_inference_colab.ipynb`. Notebook ini membuat tunnel Cloudflare dan
  mencetak `INFERENCE_URL` + `INFERENCE_API_KEY`. URL berubah setiap kali dijalankan, dan sesi
  Colab bisa mati sewaktu-waktu.
- **Pemakaian yang lebih stabil:** VM atau server GPU (RunPod, Vast.ai, Lambda, GCP/AWS dengan
  T4/L4, atau server milik institusi). Jalankan:

  ```bash
  docker compose --profile gpu up -d --build inference-gpu
  ```

  Isi `.env` dengan `INFERENCE_API_KEY=<rahasia>`, dan `HF_TOKEN` jika repo adapter-nya private.
  `INFERENCE_MODE=real` sudah diatur oleh service `inference-gpu`.

### B. API NestJS di server yang selalu hidup

Bisa di VPS biasa, Railway, Render, Fly.io, atau di mesin GPU yang sama dengan langkah A (paling
simpel). Isi `apps/api/.env`:

```env
INFERENCE_URL=https://<url-server-inferensi>
INFERENCE_API_KEY=<rahasia yang sama>
INFERENCE_TIMEOUT_MS=60000   # terukur di T4 (PV9); GPU lain perlu diukur ulang
WEB_ORIGIN=https://<domain>.vercel.app
```

`WEB_ORIGIN` wajib diisi karena CORS di `apps/api/src/main.ts` hanya mengizinkan origin yang
tercantum di variabel ini. API juga harus bisa diakses lewat **HTTPS**. Kalau tidak, browser akan
memblokir request dari halaman Vercel yang memakai HTTPS (mixed content). Untuk HTTPS bisa pakai
Caddy, nginx + Let's Encrypt, atau Cloudflare Tunnel.

### C. Environment variable di Vercel

```env
NEXT_PUBLIC_DATA_MODE=api
NEXT_PUBLIC_API_BASE_URL=https://<url-api>
```

Setelah itu lakukan **redeploy**. Variabel `NEXT_PUBLIC_*` dimasukkan ke kode saat build, jadi
mengubah env saja tanpa redeploy tidak berpengaruh.

## 4. Komponen yang dibutuhkan modul deteksi stres

| Komponen                                | Butuh GPU?                | Keterangan                                                                                         |
| --------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Server inferensi (`apps/inference`)     | Ya (NVIDIA, VRAM ~8–9 GB) | Memuat Qwen3-VL-4B + LoRA                                                                          |
| API NestJS (`apps/api`)                 | Tidak                     | Wajib ada; frontend dan kamera tidak pernah memanggil server inferensi secara langsung             |
| Frontend (Vercel)                       | Tidak                     | Sudah ada                                                                                          |
| Postgres                                | Tidak (untuk saat ini)    | Belum dipakai modul vision; baru diperlukan kalau hasil deteksi harus tetap tersimpan setelah restart |

Postgres **tidak** dipakai modul deteksi stres. Penyimpanan hasil vision
(`apps/api/src/vision/vision.repository.ts`) masih in-memory, dan Postgres sengaja ditunda.
Konsekuensinya, riwayat hasil deteksi hilang setiap kali API restart.

## 5. Apakah kode di repo cukup untuk deploy server inferensi real di institusi?

Untuk kode server inferensinya, **sudah cukup**:

- `apps/inference/Dockerfile` dengan build arg `INSTALL_REAL=1`.
- Service `inference-gpu` di `docker-compose.yml`, sudah meminta GPU NVIDIA dan menyimpan cache
  model di volume `agronova-poultry-hf-cache`.
- Bobot model tidak disimpan di repo. Bobot **diunduh otomatis dari Hugging Face** saat pertama
  kali jalan: base `Qwen/Qwen3-VL-4B-Instruct` dan adapter `Arga23/chickenstress-vlm-lora`.

Yang tetap harus disiapkan institusi:

1. **Mesin GPU NVIDIA** dengan driver NVIDIA dan **NVIDIA Container Toolkit** terpasang. Tanpa
   toolkit ini, Docker tidak bisa memakai GPU.
2. **Akses internet ke Hugging Face** saat pertama kali jalan, untuk mengunduh model berukuran
   sekitar 8–9 GB, plus ruang disk yang cukup. Jika repo adapter private, perlu `HF_TOKEN`.
   Disarankan menyalin adapter ke akun HF milik institusi, atau memakai folder lokal
   (`HF_ADAPTER_REPO` boleh berisi path folder).
3. **API NestJS belum punya Dockerfile** dan tidak ada di `docker-compose.yml`. API harus
   dijalankan manual dengan Node ≥ 22 (`corepack pnpm install`, `build`, lalu jalankan
   `apps/api`), atau dibuatkan Dockerfile terlebih dahulu.
4. **HTTPS dan domain** untuk API, lalu atur `WEB_ORIGIN` di API dan `NEXT_PUBLIC_API_BASE_URL`
   di Vercel.

Risiko: `apps/inference/requirements-real.txt` tidak mengunci versi (`torch`,
`transformers>=4.57`, `peft`, `accelerate`, `huggingface_hub`). Build ulang di kemudian hari bisa
memasang versi yang tidak kompatibel. Sebaiknya kunci ke versi yang sudah terbukti jalan, lalu
verifikasi dengan `apps/inference/scripts/parity_check.py`.

## 6. Integrasi kamera IoT

### Apakah kamera otomatis mengirim data (feed)?

**Belum otomatis dengan kode yang ada sekarang.** API sudah siap menerima gambar kapan saja
(`POST /api/v1/vision/frames`), dan setiap gambar yang masuk langsung diproses: inferensi, aturan
SCS, lalu voting 5 frame. Tapi **belum ada komponen yang mengambil foto dari kamera lalu
mengirimnya ke API secara berkala.**

- `CLAUDE.md` menyebut `apps/simulator/src/vision-feeder.ts` (`feed:vision`), tetapi file itu
  **tidak ada**. Isi `apps/simulator/src` hanya `index.ts`, dan `package.json` simulator tidak
  punya script `feed:vision`.
- Jadi saat ini gambar hanya masuk lewat upload manual di halaman `/vision` atau request manual
  (misalnya `curl`).

Supaya feed berjalan otomatis, perlu dibuat salah satu dari:

1. **Firmware di kamera** yang bisa mengirim HTTP POST sendiri (ESP32-CAM, Raspberry Pi +
   kamera). Perangkat memotret setiap N detik lalu mengirimkannya ke API.
2. **Gateway di lokasi kandang** (Raspberry Pi atau mini PC) untuk IP camera/CCTV yang hanya
   menyediakan snapshot URL atau RTSP. Gateway mengambil frame secara berkala lalu mengirimkannya
   ke API. Cara ini paling umum untuk kandang yang sudah memakai CCTV.

Setelah salah satunya berjalan, alurnya otomatis: kamera/gateway mengirim gambar, API memprosesnya,
dan dashboard `/vision` menampilkan hasil terbaru.

### Format yang harus dikirim kamera/gateway

Diatur di `packages/vision-schema` (`visionFrameMetadataSchema`) dan
`apps/api/src/vision/vision.controller.ts`. Request berupa `multipart/form-data`:

| Field         | Wajib | Isi                                                                                   |
| ------------- | ----- | ------------------------------------------------------------------------------------- |
| `image`       | Ya    | Tepat 1 file JPEG/PNG/WebP, maksimal 8 MB                                             |
| `camera_id`   | Ya    | ID kamera, 1–64 karakter, misalnya `CAM-KANDANG1-01`                                  |
| `kandang_id`  | Tidak | ID kandang                                                                            |
| `captured_at` | Ya    | Waktu UTC format ISO, misalnya `2026-10-28T03:15:00Z` (harus `Z`, bukan `+07:00`)     |

Field selain ini ditolak karena schema-nya `.strict()`. Contoh:

```bash
curl -X POST https://<api>/api/v1/vision/frames \
  -F image=@foto.jpg -F camera_id=CAM-01 -F kandang_id=K1 \
  -F captured_at=2026-10-28T03:15:00Z
```

`camera_id` harus tetap dan unik per kamera, karena voting 5 frame dihitung per kamera. Perangkat
juga perlu sinkronisasi waktu (NTP) supaya `captured_at` akurat.

### Hal yang perlu diperhatikan

- **Endpoint upload belum punya autentikasi.** `INFERENCE_API_KEY` hanya melindungi koneksi API ke
  server inferensi. Jika API dibuka ke internet, siapa pun bisa mengirim gambar dan membebani GPU.
  Tambahkan API key per perangkat, atau letakkan API dan kamera di jaringan privat/VPN.
- **Interval pengiriman.** Satu inferensi real di T4 memakan p50 9,8 detik / p95 11,2 detik per
  gambar, dan layanan hanya menjalankan satu gambar sekaligus. Mulai dari 1 frame per 30–60 detik
  per kamera, lalu sesuaikan dengan jumlah kamera dan kapasitas GPU.
- **Pemakaian in-process.** Jika layanan di-import langsung di kernel Colab/Jupyter (bukan uvicorn
  di proses terpisah), set `INFERENCE_EXIT_ON_LOAD_ERROR=false`. Tanpa itu, gagal load akan
  mematikan kernel.
- **Alert belum otomatis.** API sudah menghitung `trigger_alert` (minimal 3 dari 5 vote stres),
  tetapi belum ada notifikasi (WA, email, push). Itu bagian modul alerts yang belum
  diimplementasikan.
- **Kamera dan sensor sama-sama lewat HTTP.** Repo tidak memakai MQTT (keputusan 2026-11-20). Gambar
  dikirim lewat HTTP POST langsung ke API, melalui Cloudflare Tunnel yang sama dengan telemetri.

## 7. Temporal gate (temporal voting)

### Konsep sederhana

Model menilai **satu foto saja**. Satu foto bisa menipu: ayam sedang menguap, tertangkap saat
mengepakkan sayap, atau foto agak buram. Kalau setiap foto "stres" langsung dianggap alarm, akan
banyak alarm palsu.

Temporal gate bekerja seperti **musyawarah 5 foto terakhir dari kamera yang sama**. Sistem baru
menyatakan alert kalau mayoritas (minimal 3 dari 5) foto terakhir menunjukkan stres. Jadi alert
hanya muncul kalau tanda stres terlihat **berulang dari waktu ke waktu**, bukan hanya sekali.

Analogi: satu saksi bilang "ada maling" belum cukup; kalau 3 dari 5 saksi bilang hal yang sama,
baru dianggap serius.

### Langkahnya untuk setiap foto yang masuk

1. **Foto tanpa hasil diabaikan.** Kalau foto gagal quality gate (`skipped_quality`), jawaban
   model tidak bisa dibaca (`parse_error`), atau server inferensi error (`inference_error`), foto
   tidak ikut voting. Status: `ignored_no_result`.
2. **Foto "tidak bisa dinilai" diabaikan.** Kalau kurang dari 5 dari 7 indikator terlihat, label
   menjadi `undefined` dan foto tidak ikut voting. Status: `ignored_undefined`.
3. **Foto berlabel `stress` atau `not_stress` masuk "jendela" 5 suara terakhir** kamera tersebut,
   berapa pun confidence-nya. Kalau jendela belum penuh (belum ada 5 suara), statusnya
   `waiting_window`.
4. **Jendela penuh, dihitung suaranya.** Kalau minimal 3 dari 5 suara adalah `stress`, status
   `alert` dan `trigger_alert = true`. Kalau tidak, status `no_alert`.

Konstanta (window 5, alert ≥ 3 suara) berasal dari voter di notebook inference 04 dan disimpan di
`packages/vision-schema`. Sejak keputusan 2026-11-13 (AUDIT K1/V1), voter **sengaja menyimpang**
dari notebook itu: filter confidence ≥ 0.6 dihapus. `ignored_low_confidence` tidak lagi
dihasilkan, dan `VOTE_CONFIDENCE_THRESHOLD` hanya disimpan sebagai konstanta deprecated.

### Cara confidence dihitung (penting untuk dipahami)

Di `apps/inference/app/pipeline.py`, `score_stress = jumlah YA / 7`, lalu:

- label `stress` → confidence = `score_stress`
- label `not_stress` → confidence = `1 − score_stress`

Confidence ini mengukur **keparahan** (berapa indikator YA), bukan kepastian model. Dengan batas
0.6 lama (notebook 04), akibatnya:

| Jumlah YA | Label        | Confidence | Ikut voting?                        |
| --------- | ------------ | ---------- | ----------------------------------- |
| 0–2       | `not_stress` | 1.00–0.71  | Ya                                  |
| 3         | `stress`     | 0.43       | **Tidak** (`ignored_low_confidence`) |
| 4         | `stress`     | 0.57       | **Tidak** (`ignored_low_confidence`) |
| 5–7       | `stress`     | 0.71–1.00  | Ya                                  |

Dengan aturan lama, foto `stress` baru dihitung sebagai suara stres kalau minimal 5 indikator
bernilai YA, sehingga di data evaluasi alert tidak pernah menyala. Karena itu sejak 2026-11-13
semua foto `stress`/`not_stress` ikut voting tanpa filter confidence; tabel di atas hanya menjelaskan
alasan perubahan.

### Integrasinya di mana?

```
Kamera/gateway → API NestJS ──► server inferensi (hasil 1 foto: label + confidence)
                     │
                     ├─ ambil 4 suara terakhir kamera ini dari repository
                     ├─ evaluateVote() di packages/vision-schema/src/voter.ts
                     ├─ simpan hasil + vote ke repository
                     ▼
               Dashboard /vision (teks vote + badge alert)
```

- **Logika voting:** `packages/vision-schema/src/voter.ts` (`evaluateVote`, di-re-export oleh
  `apps/api/src/vision/voter.ts`), dijalankan di **API NestJS**,
  bukan di server inferensi dan bukan di kamera. Server inferensi hanya menilai satu foto.
- **Dipanggil dari:** `apps/api/src/vision/vision.service.ts`. Setelah hasil inferensi diterima,
  service mengambil 4 suara terakhir kamera yang sama (`repository.acceptedLabels(camera_id, 4)`),
  lalu menggabungkannya dengan suara foto baru menjadi jendela 5.
- **Kontrak data:** field `vote` di `packages/vision-schema` (`status`, `trigger_alert`,
  `window_filled`, `majority_label`, `majority_count`).
- **Tampilan:** `apps/web/components/vision/vision-result-card.tsx` menampilkan status vote
  (misalnya "Stres 3/5") dan badge alert jika `trigger_alert = true`.

### Keterbatasan saat ini

- **Jendela dihitung per jumlah foto, bukan per waktu.** Lima suara terakhir dipakai berapa pun
  jarak waktunya. Kalau kamera sempat mati beberapa jam, suara lama tetap ikut dihitung.
- **Riwayat suara hilang saat API restart**, karena repository masih in-memory. Setelah restart,
  setiap kamera mulai lagi dari `waiting_window`.
- **`trigger_alert` belum memicu notifikasi apa pun.** Alert hanya terlihat di dashboard.
- Voting dihitung per `camera_id`, jadi ID kamera harus tetap dan unik.

## 8. Catatan tindak lanjut

- **Rujukan feeder di `CLAUDE.md` tidak sesuai repo.** `CLAUDE.md` menyebut
  `apps/simulator/src/vision-feeder.ts` (`feed:vision`), tetapi file dan script tersebut tidak
  ada. Perlu diperbaiki rujukannya, atau feeder-nya dibuat.
- **Script gateway kamera belum ada.** Perlu dibuat agar feed dari kamera/CCTV ke API berjalan
  otomatis (lihat bagian 6).
- **Endpoint upload belum diberi autentikasi** (API key per perangkat).
- **Dockerfile API NestJS belum ada.**
- **Versi dependensi inferensi belum dikunci** (`requirements-real.txt`).

## 9. Ringkasan kebutuhan

| Kebutuhan                                         | Status di repo                         |
| ------------------------------------------------- | -------------------------------------- |
| Frontend di Vercel                                | Sudah ada                              |
| Server inferensi GPU (Docker)                     | Sudah ada, tinggal deploy di mesin GPU |
| API NestJS                                        | Kode ada, Dockerfile belum ada         |
| HTTPS/domain untuk API                            | Disiapkan saat deployment              |
| Feeder/gateway kamera (feed otomatis)             | Belum ada, perlu dibuat                |
| Autentikasi endpoint upload                       | Belum ada                              |
| Penyimpanan hasil permanen (Postgres)             | Belum ada (sengaja ditunda)            |
| Notifikasi alert                                  | Belum ada                              |
| Penguncian versi dependensi inferensi             | Belum ada                              |

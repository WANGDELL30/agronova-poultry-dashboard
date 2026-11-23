# Uji coba bot WhatsApp end-to-end

Panduan langkah demi langkah untuk mencoba bot dari nol: dulu secara lokal tanpa akun Meta, lalu
tersambung ke WhatsApp sungguhan. Penjelasan teknis ada di [README.md](README.md).

Semua perintah dijalankan dari folder repo (`agronova-poultry-dashboard`) di Git Bash.

## Gambaran

```text
HP Anda ⇄ WhatsApp (Meta) ⇄ cloudflared ⇄ bot (:4100) ──GET──▶ API (:4000) ◀── ESP32 tiruan
                                             └──▶ LLM di Colab (opsional)
```

Yang perlu jalan bersamaan: **API**, **bot**, dan **ESP32 tiruan** (pengganti perangkat, karena
belum ada ESP32 yang mengirim data). LLM di Colab opsional; tanpa LLM, bot membalas dengan ringkasan
status tetap.

## 1. Persiapan (sekali saja)

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @agronova/telemetry-schema --filter @agronova/vision-schema --filter @agronova/mortality-model build
cp apps/whatsapp-bot/.env.example apps/whatsapp-bot/.env
```

Pastikan `apps/api/.env` sudah ada (lihat README utama, bagian _Environment setup_).

## 2. Uji lokal tanpa Meta (±10 menit)

Di `apps/whatsapp-bot/.env`, isi minimal:

```env
WA_PROVIDER=console
WA_ALLOWED_NUMBERS=6281234567890
```

`WA_ALLOWED_NUMBERS` berisi nomor Anda: kode negara tanpa `+` atau `0` di depan. Contoh: `0812-3456-7890`
ditulis `6281234567890`.

Buka empat terminal:

| Terminal | Perintah                                                                               | Fungsi                               |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| 1        | `corepack pnpm --filter @agronova/api dev`                                             | API                                  |
| 2        | `corepack pnpm --filter @agronova/whatsapp-bot dev`                                    | Bot; balasan muncul di sini          |
| 3        | `corepack pnpm --filter @agronova/whatsapp-bot device:fake`                            | ESP32 tiruan, kirim data tiap 10 dtk |
| 4        | `corepack pnpm --filter @agronova/whatsapp-bot message:fake "gimana kondisi kandang?"` | Kirim pesan WhatsApp tiruan          |

Dalam mode console, bot **tidak mengirim apa pun** ke WhatsApp; balasannya dicetak di terminal 2.

Pilihan ESP32 tiruan (hentikan dengan Ctrl+C, lalu jalankan lagi dengan pilihan lain):

| Pilihan                          | Yang disimulasikan                                                           |
| -------------------------------- | ---------------------------------------------------------------------------- |
| (tanpa pilihan)                  | Semua sensor normal, suhu ±28,5 °C                                           |
| `--scenario sensor-disconnected` | Sensor kelembapan terputus (nilai `null`, bukan nol)                         |
| `--scenario sensor-invalid`      | Pembacaan MQ-5 tidak valid                                                   |
| `--scenario hot`                 | Suhu 38,2 °C; memicu warning hanya jika `WA_TEMP_MAX_C` diisi, misalnya `32` |
| `--interval 5`                   | Kirim tiap 5 detik                                                           |
| Ctrl+C (berhenti)                | Perangkat dianggap **offline** setelah ±30 detik                             |

## 3. LLM di Colab (opsional)

1. Upload `apps/whatsapp-bot/colab/run_llm_colab.ipynb` ke Colab (File → Upload notebook).
2. Runtime → Change runtime type → **T4 GPU**, lalu **Run all**. Pakai `JALANKAN_VLM = True` jika
   deteksi stres juga ingin dicoba (Colab gratis biasanya hanya memberi satu sesi GPU).
3. Salin empat baris `WA_LLM_*` dari output terakhir ke `apps/whatsapp-bot/.env`, lalu restart bot
   (terminal 2). Log bot saat start harus menyebut `Answers come from model "qwen3:4b"`.

## 4. Sambungkan ke WhatsApp sungguhan

### 4a. Siapkan app di Meta

1. Buka [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
   Pilih use case WhatsApp/Business dan tautkan ke business portfolio (buat baru jika belum ada).
2. Menu **WhatsApp → API Setup**:
   - catat **Phone number ID** milik nomor tes dari Meta;
   - klik **Generate access token** (token sementara, berlaku ±24 jam);
   - di kolom **To**, tambahkan nomor HP Anda dan masukkan kode verifikasinya. Nomor tes hanya
     bisa berkirim pesan dengan nomor yang terdaftar di sini.
   - catat versi Graph API di contoh `curl` (misalnya `v23.0`).
3. Menu **App settings → Basic**: klik **Show** pada **App secret** dan salin.

### 4b. Isi `apps/whatsapp-bot/.env`

```env
WA_PROVIDER=meta
WA_ACCESS_TOKEN=<token dari API Setup>
WA_APP_SECRET=<app secret>
WA_VERIFY_TOKEN=<string bebas buatan Anda, misalnya agronova-uji-123>
WA_PHONE_NUMBER_ID=<phone number id>
WA_ALLOWED_NUMBERS=<nomor HP Anda, format 62...>
WA_GRAPH_API_VERSION=<versi dari API Setup>
```

Restart bot (terminal 2).

### 4c. Buka bot ke internet

Meta mengirim pesan ke bot lewat HTTPS publik. Di terminal baru:

```bash
winget install Cloudflare.cloudflared   # sekali saja; buka ulang terminal setelahnya
cloudflared tunnel --url http://localhost:4100
```

Catat URL `https://xxxx.trycloudflare.com` yang muncul. Biarkan terminal ini terbuka.

### 4d. Daftarkan webhook

1. Menu **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL**: `https://xxxx.trycloudflare.com/webhook`
   - **Verify token**: sama persis dengan `WA_VERIFY_TOKEN`
   - klik **Verify and save** (bot dan cloudflared harus sedang jalan).
2. Di **Webhook fields**, klik **Subscribe** pada `messages`.

### 4e. Kirim pesan

Dari HP Anda, kirim pesan WhatsApp ke nomor tes Meta, misalnya "gimana kondisi kandang?".

## 5. Skenario uji

**Kirim satu pesan ke bot dulu** sebelum menguji warning (lihat bagian berikutnya).

| Coba                                                 | Hasil yang diharapkan                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| "gimana kondisi kandang?"                            | Suhu, kelembapan, MQ-5 tanpa ppm; sensor yang tidak terpasang disebut "belum terpasang" |
| "kadar gas berapa?"                                  | Tidak pernah menyebut ppm                                                               |
| "nyalakan kipas"                                     | Balasan bahwa kontrol perangkat belum tersedia                                          |
| Kirim foto atau voice note                           | Diminta mengirim teks                                                                   |
| ESP32 tiruan `--scenario sensor-disconnected`        | Warning "Sensor kelembapan udara ... bermasalah: sensor terputus"                       |
| Hentikan ESP32 tiruan, tunggu ±40 dtk                | Warning "Perangkat ... OFFLINE"                                                         |
| Jalankan ESP32 tiruan lagi                           | Info "Perangkat ... kembali ONLINE"                                                     |
| Hentikan API, tunggu ±30 dtk                         | Warning "Bot tidak dapat menghubungi API", lalu info saat API hidup lagi                |
| Matikan sesi Colab                                   | Pertanyaan dijawab dengan ringkasan status tetap                                        |
| `message:fake --from 6289999999999 "status"` (lokal) | Tidak ada balasan; log bot: `not in WA_ALLOWED_NUMBERS`                                 |
| Upload ≥ 5 frame stres di `/vision`                  | Warning kamera (perlu inferensi VLM jalan)                                              |

Warning yang sama tidak dikirim berulang: sekali saat mulai, sekali saat pulih, dan paling banyak
sekali per `WA_ALERT_COOLDOWN_MS` (default 15 menit) jika kondisinya bolak-balik.

### 5a. Peringatan kamera end-to-end (`frames:fake`)

Kamera tiruan mengirim crop ayam berlabel dari repo (`data/working/dataset/<split>/<label>`) ke
`POST /api/v1/vision/frames`, satu per satu, lalu mencetak hasil dan vote tiap frame. Lima frame mengisi
jendela voting; tiga suara stres memicu alert, dan bot mengirim warning kamera.

```bash
corepack pnpm --filter @agronova/whatsapp-bot frames:fake                    # 5 crop stres, tiap 11 dtk
corepack pnpm --filter @agronova/whatsapp-bot frames:fake --label not_stress  # pembanding: tidak boleh alert
corepack pnpm --filter @agronova/whatsapp-bot frames:fake --key <kunci cam-01> # bila VISION_CAMERA_KEYS diisi
```

| Kondisi                                   | Yang terjadi                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| API tanpa `VISION_CAMERA_KEYS`            | Frame tercatat `camera` dan ikut voting                                                            |
| `VISION_CAMERA_KEYS` diisi, tanpa `--key` | Frame `manual`: diprediksi, tetapi tidak voting dan tidak pernah alert                             |
| Inference `INFERENCE_MODE=mock`           | Label acak (bukan model); untuk melihat alert pakai `--count 15`. Warning bot menyebut "mode mock" |
| Inference real (Colab/server)             | Label dari model; frame `undefined` tidak ikut voting, jadi bisa butuh lebih dari 5 frame          |

Jeda default 11 dtk mengikuti batas satu frame per 10 dtk per kamera (`VISION_CAMERA_INTERVAL_MS`).
Tanpa kunci kamera, `--interval 0` boleh, tetapi upload manual dibatasi 10 per jam per IP.

### 5b. Template peringatan di Meta

Di luar 24 jam setelah pesan terakhir penerima, WhatsApp hanya mengirim template yang sudah disetujui.
Tanpa template, warning dicatat di log bot dan tidak terkirim. Buat sekali di **WhatsApp Manager →
Message templates → Create template**:

| Kolom                  | Isi                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Category               | **Utility** (pemberitahuan operasional, bukan promosi)                                                                           |
| Name                   | `agronova_peringatan` (huruf kecil dan garis bawah)                                                                              |
| Language               | Indonesian (`id`)                                                                                                                |
| Body                   | `Peringatan AgroNova: {{1}}`                                                                                                     |
| Sample untuk `{{1}}`   | `Perangkat AGRONOVA-ESP32-01 OFFLINE. Terakhir terlihat 08.15. Data sensor tidak diperbarui sampai perangkat kembali terhubung.` |
| Header, footer, tombol | Kosong                                                                                                                           |

Satu parameter saja: bot mengisi `{{1}}` dengan teks warning yang sudah dijadikan satu baris (maks
1000 karakter). Setelah statusnya **Approved**, isi di `apps/whatsapp-bot/.env` lalu restart bot:

```env
WA_ALERT_TEMPLATE=agronova_peringatan
WA_ALERT_TEMPLATE_LANGUAGE=id
```

Uji: jangan kirim pesan ke bot selama lebih dari 24 jam (atau restart bot; bot lupa jendela 24 jam
setelah restart), lalu picu warning, misalnya dengan menghentikan ESP32 tiruan. Pesan yang datang
diawali "Peringatan AgroNova:". Bila Meta menolak atau mengubah kategori ke Marketing, perjelas body
bahwa ini pemberitahuan kondisi perangkat dan ajukan ulang.

### 5c. Uji beban GPU bersama (VLM + LLM)

Di `colab/run_llm_colab.ipynb`, set `JALANKAN_VLM = True` lalu **Run all**. Sel "Uji beban bersama"
menjalankan 3 frame VLM bersamaan dengan 3 pertanyaan LLM, mencatat puncak memori GPU, dan mencetak
**LULUS** bila tidak ada `gpu_oom` atau error, serta waktu frame terlama dibanding
`INFERENCE_TIMEOUT_MS` (60 dtk). Bila mendekati batas, naikkan `INFERENCE_TIMEOUT_MS` di
`apps/api/.env` atau pakai model LLM lebih kecil. Di server pilot, ulangi langkah yang sama dengan
`nvidia-smi` dan unggahan `/vision` saat bot sedang menjawab (README bot, _Before going live_).

## 6. Hal yang sering bikin bingung

- **Warning tidak sampai ke HP.** WhatsApp hanya mengizinkan bot mengirim teks bebas dalam 24 jam
  setelah Anda terakhir mengirim pesan ke bot. Kirim pesan ke bot dulu. Setelah bot di-restart,
  ingatan 24 jam itu hilang, jadi kirim pesan lagi. Untuk penggunaan nyata perlu template yang
  disetujui Meta (`WA_ALERT_TEMPLATE`, lihat README).
- **URL cloudflared berubah setiap dijalankan.** Daftarkan ulang Callback URL di Meta setiap kali.
- **Token sementara habis setelah ±24 jam.** Buat lagi di API Setup, atau buat token permanen
  lewat System User di Business Settings.
- **Bot tidak membalas sama sekali.** Cek log bot:
  - `not in WA_ALLOWED_NUMBERS`: format nomor salah (harus `62...`, tanpa `+`/`0`).
  - `401 invalid_signature` di log Fastify: `WA_APP_SECRET` tidak cocok.
  - tidak ada log sama sekali: webhook belum di-subscribe ke `messages`, atau URL tunnel sudah
    berganti.
- **"Verify and save" gagal.** Bot atau cloudflared belum jalan, atau verify token tidak sama.
- **Balasan selalu ringkasan, bukan jawaban LLM.** `WA_LLM_BASE_URL` kosong, sesi Colab mati, atau
  `WA_LLM_API_KEY` tidak sama dengan output notebook.
- **Perangkat langsung OFFLINE.** ESP32 tiruan tidak jalan, atau `AGRONOVA_DEVICE_ID` di `.env` bot
  berbeda dengan device yang dikirim.
- **ESP32 tiruan mendapat HTTP 401 atau 403.** API memakai `TELEMETRY_DEVICE_KEYS`. Isi
  `AGRONOVA_DEVICE_KEY` di `.env` bot (atau `--key`) dengan kunci milik `AGRONOVA_DEVICE_ID`: 401 berarti
  kuncinya kosong atau salah, 403 berarti kuncinya milik device lain.

## 7. Selesai menguji

- Hentikan semua terminal (Ctrl+C) dan sesi Colab.
- Jangan commit `.env`; isinya token Meta dan key LLM (sudah diabaikan oleh `.gitignore`).

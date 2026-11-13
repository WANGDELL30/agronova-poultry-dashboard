# Perubahan VLM workflow terhadap kode awal

> **Status dokumen (2026-11-13, audit C1, DOC2, DOC4, P5):** ini catatan rencana, dan sebagian isinya
> tidak pernah masuk repo. Yang **tidak ada**: `apps/simulator/src/vision-feeder.ts`, script
> `feed:vision`, env `FEED_*`/`CAMERA_ID`, `MERGE_ADAPTER` (dan field `merge_adapter`), serta mount
> `./infrastructure/data/adapter` → `/adapter`. Profile compose untuk mock bernama `inference`, bukan
> `mock`. Bagian di bawah sudah dikoreksi. Baris yang tidak terimplementasi ditandai
> *(tidak terimplementasi)*.

## Temuan: sebagian besar sudah ada

Dashboard awal ternyata sudah punya jalur VLM yang hampir lengkap. **Tidak ada yang ditulis ulang.**

| Bagian | Lokasi | Status awal |
|---|---|---|
| Kontrak data (zod, v1) | `packages/vision-schema` | Ada |
| Service inference FastAPI (quality gate → Qwen3-VL-4B + LoRA → aturan SCS), mode `mock`/`real` | `apps/inference` | Ada |
| Modul API: `POST /vision/frames`, `GET /vision/results`, voting temporal 5 frame | `apps/api/src/vision` | Ada (penyimpanan **in-memory**) |
| UI + client (mock/api) | `apps/web/components/vision`, `lib/vision` | Ada |
| Compose untuk service inference (README menyebut profile `gpu`) | `docker-compose.yml` | **Belum ada** |
| Env inference di API | `apps/api/.env.example` | **Belum ada** |
| Pengirim frame berkala (pengganti kamera IoT) | - | **Belum ada** |
| Adapter lokal tanpa HF token / opsi merge LoRA | `apps/inference/app/backends.py` | **Belum ada** |

## Daftar perubahan

Rencana awal: 6 file diubah dan 2 file baru (dengan file ini). Yang benar-benar masuk lebih sedikit, lihat tanda pada tabel. Logika SCS, quality gate, voter, dan kontrak schema tidak disentuh.

| File | Perubahan |
|---|---|
| `docker-compose.yml` | Tambah service `inference` (profile `inference`, CPU) dan `inference-gpu` (profile `gpu`, NVIDIA, cache HF). Mount `./infrastructure/data/adapter` → `/adapter` *(tidak terimplementasi)*. Tanpa profile, `docker compose up` **tidak berubah**. |
| `env.example` | Tambah `INFERENCE_PORT`, `INFERENCE_API_KEY`, `HF_TOKEN`, `HF_ADAPTER_REPO` (tanpa nilai rahasia). `MERGE_ADAPTER` *(tidak terimplementasi)*. |
| `apps/api/.env.example` | Tambah `INFERENCE_URL`, `INFERENCE_TIMEOUT_MS`, `INFERENCE_API_KEY`, `VISION_IMAGE_DIR`, `VISION_MAX_IMAGE_BYTES` (sudah dibaca `vision-config.ts`, tapi belum terdokumentasi). |
| `apps/inference/app/config.py` | *(tidak terimplementasi)* Field baru `merge_adapter` (env `MERGE_ADAPTER`, default **off**). Default `False` menjaga hasil identik dengan notebook (parity check). |
| `apps/inference/app/backends.py` | (1) `HF_ADAPTER_REPO` boleh berupa **folder lokal**; `HF_TOKEN` hanya wajib kalau adapter dari HF Hub. (2) Opsi `merge_and_unload()` bila `MERGE_ADAPTER=1` *(tidak terimplementasi)*. (3) Revision HF dilewati untuk adapter lokal (`adapter_revision: null`). |
| `apps/simulator/src/vision-feeder.ts` (baru) *(tidak terimplementasi)* | Mengambil 1 frame per `FEED_INTERVAL_MS` (default 15 dtk) dari folder gambar atau URL snapshot kamera, lalu `POST /vision/frames`. Berjalan sekuensial agar tidak ada antrean menumpuk, dan tidak berhenti kalau satu frame gagal. |
| `apps/simulator/package.json` | Script `feed:vision` *(tidak terimplementasi)*. |

## Cara pakai tanpa tunnel Kaggle

**1. Demo lokal tanpa GPU (mock)**
```bash
docker compose --profile inference up inference   # atau: INFERENCE_MODE=mock uvicorn app.main:app
pnpm --filter @agronova/api dev
# kirim frame lewat halaman /vision atau curl (tidak ada feeder):
curl -F image=@foto.jpg -F camera_id=cam-01 -F captured_at=2026-01-01T00:00:00Z http://localhost:4000/api/v1/vision/frames
```
Mode mock hanya menguji alur. Hasilnya bukan prediksi model sungguhan.

**2. Server dengan GPU (model asli)**
```bash
# adapter dari HF (repo publik, HF_TOKEN opsional):
INFERENCE_API_KEY=<acak> docker compose --profile gpu up inference-gpu
# adapter dari folder lokal hanya bisa tanpa compose (compose tidak me-mount /adapter):
HF_ADAPTER_REPO=./path/ke/adapter INFERENCE_MODE=real uvicorn app.main:app
```
Lalu di `.env` API: `INFERENCE_URL=http://<host-gpu>:8000` dan `INFERENCE_API_KEY` yang sama. Base model `Qwen/Qwen3-VL-4B-Instruct` tetap diunduh dari HF saat start (publik, di-cache di volume `agronova_hf_cache`). `GET /health` mengembalikan 503 sampai model selesai dimuat.

**3. Kamera IoT asli**: kamera atau gateway cukup `POST multipart` ke `/vision/frames` (field `image`, `camera_id`, `captured_at` UTC, opsional `kandang_id`). Kirim sekitar 1 frame per 10-60 detik per kamera.

## Pengecekan

- `apps/inference`: `pytest` → **13 passed** (mode mock).
- `vision-feeder.ts`: *(tidak terimplementasi; file tidak ada di repo)*.
- `docker-compose.yml`: YAML valid, 4 service terbaca.

**Tidak dijalankan:** typecheck/lint/test seluruh monorepo pnpm (dependency tidak ada di sandbox), build Docker, mode `real` di GPU, dan parity check terhadap notebook. Jalankan `pnpm typecheck && pnpm lint && pnpm test` serta parity check (`apps/inference/README.md`, bagian A) sebelum merge.

## Yang sengaja tidak dikerjakan

- **Repository PostgreSQL untuk vision.** Penyimpanan masih in-memory, jadi hasil dan jendela voting hilang saat API restart. Ini melanggar aturan "pakai migrasi" di `AGENTS.md` kalau dipaksakan, dan alat migrasi belum dipilih (Phase 2). Interface `VisionRepository` sudah siap diganti.
- **Deploy produksi, autentikasi endpoint `/vision/frames`, dan kuota/antrean multi-kamera.**
- **Kualitas model.** Test set hasil training hanya 8 gambar, jadi akurasi 100% belum bisa dianggap bukti. Uji dengan frame asli kamera kandang sebelum dipakai untuk alert.

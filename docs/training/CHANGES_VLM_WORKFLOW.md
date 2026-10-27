# Perubahan VLM workflow terhadap kode awal

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

Total 6 file diubah dan 2 file baru (dengan file ini). Logika SCS, quality gate, voter, dan kontrak schema tidak disentuh.

| File | Perubahan |
|---|---|
| `docker-compose.yml` | Tambah service `inference` (profile `mock`, CPU) dan `inference-gpu` (profile `gpu`, NVIDIA, cache HF, mount opsional `./infrastructure/data/adapter` → `/adapter`). Tanpa profile, `docker compose up` **tidak berubah**. |
| `.env.example` | Tambah `INFERENCE_PORT`, `INFERENCE_API_KEY`, `HF_TOKEN`, `HF_ADAPTER_REPO`, `MERGE_ADAPTER` (tanpa nilai rahasia). |
| `apps/api/.env.example` | Tambah `INFERENCE_URL`, `INFERENCE_TIMEOUT_MS`, `INFERENCE_API_KEY`, `VISION_IMAGE_DIR`, `VISION_MAX_IMAGE_BYTES` (sudah dibaca `vision-config.ts`, tapi belum terdokumentasi). |
| `apps/inference/app/config.py` | Field baru `merge_adapter` (env `MERGE_ADAPTER`, default **off**). Default `False` menjaga hasil identik dengan notebook (parity check). |
| `apps/inference/app/backends.py` | (1) `HF_ADAPTER_REPO` boleh berupa **folder lokal**; `HF_TOKEN` hanya wajib kalau adapter dari HF Hub. (2) Opsi `merge_and_unload()` bila `MERGE_ADAPTER=1`. (3) Revision HF dilewati untuk adapter lokal (`adapter_revision: null`). |
| `apps/simulator/src/vision-feeder.ts` (baru) | Mengambil 1 frame per `FEED_INTERVAL_MS` (default 15 dtk) dari folder gambar atau URL snapshot kamera, lalu `POST /vision/frames`. Berjalan sekuensial agar tidak ada antrean menumpuk, dan tidak berhenti kalau satu frame gagal. |
| `apps/simulator/package.json` | Script `feed:vision`. |

## Cara pakai tanpa tunnel Kaggle

**1. Demo lokal tanpa GPU (mock)**
```bash
docker compose --profile mock up inference   # atau: INFERENCE_MODE=mock uvicorn app.main:app
pnpm --filter @agronova/api dev
FEED_SOURCE=./path/ke/gambar CAMERA_ID=cam-01 pnpm --filter @agronova/simulator feed:vision
```
Mode mock hanya menguji alur. Hasilnya bukan prediksi model sungguhan.

**2. Server dengan GPU (model asli)**
```bash
# adapter dari HF private:
HF_TOKEN=... INFERENCE_API_KEY=<acak> docker compose --profile gpu up inference-gpu
# atau adapter ikut di repo/server (tanpa HF_TOKEN untuk adapter):
cp -r checkpoints/vlm_lora_adapter infrastructure/data/adapter
HF_ADAPTER_REPO=/adapter INFERENCE_API_KEY=<acak> docker compose --profile gpu up inference-gpu
```
Lalu di `.env` API: `INFERENCE_URL=http://<host-gpu>:8000` dan `INFERENCE_API_KEY` yang sama. Base model `Qwen/Qwen3-VL-4B-Instruct` tetap diunduh dari HF saat start (publik, di-cache di volume `agronova_hf_cache`). `GET /health` mengembalikan 503 sampai model selesai dimuat.

**3. Kamera IoT asli**: kamera atau gateway cukup `POST multipart` ke `/vision/frames` (field `image`, `camera_id`, `captured_at` UTC, opsional `kandang_id`). Atau arahkan `FEED_SOURCE` ke URL snapshot kamera. Kirim sekitar 1 frame per 10-60 detik per kamera.

## Pengecekan

- `apps/inference`: `pytest` → **13 passed** (mode mock).
- `vision-feeder.ts`: lolos `tsc --strict` (dicek terpisah dengan `@types/node`).
- `docker-compose.yml`: YAML valid, 4 service terbaca.

**Tidak dijalankan:** typecheck/lint/test seluruh monorepo pnpm (dependency tidak ada di sandbox), build Docker, mode `real` di GPU, dan parity check terhadap notebook. Jalankan `pnpm typecheck && pnpm lint && pnpm test` serta parity check (`apps/inference/README.md`, bagian A) sebelum merge.

## Yang sengaja tidak dikerjakan

- **Repository PostgreSQL untuk vision.** Penyimpanan masih in-memory, jadi hasil dan jendela voting hilang saat API restart. Ini melanggar aturan "pakai migrasi" di `AGENTS.md` kalau dipaksakan, dan alat migrasi belum dipilih (Phase 2). Interface `VisionRepository` sudah siap diganti.
- **Deploy produksi, autentikasi endpoint `/vision/frames`, dan kuota/antrean multi-kamera.**
- **Kualitas model.** Test set hasil training hanya 8 gambar, jadi akurasi 100% belum bisa dianggap bukti. Uji dengan frame asli kamera kandang sebelum dipakai untuk alert.

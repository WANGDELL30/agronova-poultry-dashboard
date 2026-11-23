// Pretend camera for the end-to-end warning test: posts labelled chicken crops from the repo to the API
// (POST /api/v1/vision/frames) one by one, like a camera gateway would, and prints each frame's result
// and vote. Five frames fill the voting window; three stress votes raise the alert the bot warns about.
//
// corepack pnpm --filter @agronova/whatsapp-bot frames:fake
// corepack pnpm --filter @agronova/whatsapp-bot frames:fake --label not_stress --count 5
// corepack pnpm --filter @agronova/whatsapp-bot frames:fake --camera cam-01 --key <camera key>
//
// When the API has VISION_CAMERA_KEYS set, pass this camera's key with --key or AGRONOVA_CAMERA_KEY;
// it is sent as X-Camera-Key. Without it the frames are "manual" and never vote, so no alert follows.
// The API's real result depends on the inference service: with INFERENCE_MODE=mock the labels are
// not the model's, and the bot's warning says so.
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { values } = parseArgs({
  options: {
    label: { type: 'string', default: 'stress' },
    split: { type: 'string', default: 'train' },
    dir: { type: 'string' },
    count: { type: 'string', default: '5' },
    interval: { type: 'string', default: '11' },
    camera: { type: 'string', default: 'cam-01' },
    kandang: { type: 'string' },
    key: { type: 'string' },
    api: { type: 'string' },
  },
});

const count = Number(values.count);
const intervalSeconds = Number(values.interval);
if (!Number.isInteger(count) || count < 1) {
  console.error('--count harus bilangan bulat >= 1.');
  process.exit(1);
}
// An authenticated camera may send at most one frame per VISION_CAMERA_INTERVAL_MS (default 10 s).
if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) {
  console.error('--interval harus angka detik >= 0.');
  process.exit(1);
}
const folder = values.dir
  ? resolve(values.dir)
  : join(repoRoot, 'data/working/dataset', values.split, values.label);
const apiBase = (
  values.api ??
  process.env.AGRONOVA_API_BASE_URL ??
  'http://localhost:4000'
).replace(/\/+$/, '');
const cameraKey = values.key ?? (process.env.AGRONOVA_CAMERA_KEY || null);
const url = `${apiBase}/api/v1/vision/frames`;
const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let files;
try {
  files = (await readdir(folder)).filter((name) => TYPES[extname(name).toLowerCase()]).sort();
} catch (error) {
  console.error(`Folder gambar tidak dapat dibaca: ${folder} (${error.message})`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`Tidak ada JPEG/PNG/WebP di ${folder}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function send(index) {
  const name = files[index % files.length];
  const form = new FormData();
  form.append('camera_id', values.camera);
  if (values.kandang) form.append('kandang_id', values.kandang);
  // The API needs UTC with seconds (AUDIT R8, S23).
  form.append('captured_at', new Date().toISOString());
  const data = await readFile(join(folder, name));
  form.append('image', new Blob([data], { type: TYPES[extname(name).toLowerCase()] }), name);
  const time = new Date().toLocaleTimeString('id-ID');
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      headers: cameraKey ? { 'X-Camera-Key': cameraKey } : {},
    });
    const body = await response.json().catch(() => null);
    if (!body?.vote) {
      console.log(`${time} #${index + 1} ${name} -> HTTP ${response.status} ${body?.error ?? ''}`);
      return;
    }
    const label = body.result?.label ?? body.status;
    const alert = body.vote.trigger_alert ? '  ALERT' : '';
    console.log(
      `${time} #${index + 1} ${name} -> HTTP ${response.status}, ${body.source}, ${label}, vote ${body.vote.status} (${body.vote.window_filled}/${body.vote.window_size})${alert}`,
    );
  } catch (error) {
    console.log(`${time} API tidak dapat dihubungi di ${url}: ${error.message}`);
  }
}

console.log(
  `Kamera tiruan "${values.camera}" -> ${url}: ${count} frame dari ${folder}, tiap ${intervalSeconds} dtk, ${cameraKey ? 'dengan' : 'tanpa'} X-Camera-Key.`,
);
for (let index = 0; index < count; index += 1) {
  if (index > 0) await sleep(intervalSeconds * 1000);
  await send(index);
}

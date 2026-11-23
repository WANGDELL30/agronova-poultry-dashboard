# AgroNova WhatsApp bot

A separate process that lets farm staff use WhatsApp to:

1. **receive warnings** (device offline, sensor disconnected/invalid, vision stress alert, API down),
2. **ask about the house** in free text (answered by a self-hosted open-source LLM from the latest API
   data),
3. **request device control**, which is recognised and answered with "not available yet".

It reads the existing API over HTTP `GET` only (`/api/v1/telemetry/latest`, `/api/v1/vision/results`).
It never writes to the API and never talks to the inference service. Nothing in `apps/api`,
`apps/web`, `apps/inference` or `packages/*` was changed for it.

```text
WhatsApp user ⇄ Meta Cloud API ⇄ whatsapp-bot (:4100) ──GET──▶ apps/api (:4000)
                                       └──▶ Ollama / vLLM (optional, open-source LLM for answers)
```

A step-by-step test guide in Indonesian, from a local run to real WhatsApp, is in
[TESTING.md](TESTING.md). `device:fake` (a pretend ESP32), `frames:fake` (a pretend camera that posts
labelled chicken crops, for the vision warning) and `message:fake` (a simulated incoming message) are the
helper scripts it uses. TESTING.md also lists the Meta template to submit for warnings.

## Run locally without a Meta account

```bash
cp apps/whatsapp-bot/.env.example apps/whatsapp-bot/.env   # set WA_ALLOWED_NUMBERS
corepack pnpm --filter @agronova/telemetry-schema --filter @agronova/vision-schema build
corepack pnpm --filter @agronova/whatsapp-bot dev
```

With `WA_PROVIDER=console` (the default) replies and warnings are printed to the terminal and nothing
is sent. Simulate an incoming message:

```bash
curl -X POST http://localhost:4100/webhook -H "Content-Type: application/json" -d '{
  "object":"whatsapp_business_account",
  "entry":[{"changes":[{"field":"messages","value":{"messages":[
    {"from":"6281234567890","id":"wamid.test1","timestamp":"'"$(date +%s)"'","type":"text",
     "text":{"body":"gimana kondisi kandang?"}}]}}]}]}'
```

In console mode the webhook signature is checked only when `WA_APP_SECRET` is set. The bot is not
started by the root `corepack pnpm dev`; start it separately.

## Connect to WhatsApp (Meta Cloud API)

1. In Meta for Developers: create a Business app, add the WhatsApp product, and note the phone number
   id, a permanent access token (system user), and the app secret.
2. Expose the bot over public HTTPS (a tunnel in development; an always-on server in production).
3. Set `WA_PROVIDER=meta`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` (any secret you
   choose), `WA_PHONE_NUMBER_ID`, `WA_ALLOWED_NUMBERS`, and `WA_GRAPH_API_VERSION` (the version shown in
   your app dashboard).
4. Register `https://<host>/webhook` as the callback URL with the same verify token and subscribe to
   the `messages` field.
5. For warnings, create a **utility** template with exactly one body parameter, for example
   `Peringatan AgroNova: {{1}}`, wait for approval, and set `WA_ALERT_TEMPLATE` to its name.

WhatsApp only delivers free-form text within 24 hours of the recipient's last message. Outside that
window the bot sends the template; without a template the warning is logged and not delivered.

## Behaviour that follows the project rules (`AGENTS.md`)

- MQ-5 is reported as relative level, ADC and voltage only, never as ppm.
- A missing value is reported as missing with its sensor status, never as zero.
- Values from an offline device are labelled as old.
- Manual test uploads from the dashboard (`source: manual`) are skipped: they are neither reported as a
  camera's state nor turned into warnings (`latestPerCamera` in `src/agronova/snapshot.ts`).
- Vision output is worded as decision support. `skipped_quality`, `parse_error`, `inference_error`
  and label `undefined` are never worded as "not stressed".
- Timestamps stay in UTC and are converted for display only (`WA_DISPLAY_TIMEZONE`).

These rules are enforced in `src/agronova/snapshot.ts` (the text the LLM receives is already
compliant) and repeated in the system prompt in `src/chat/assistant.ts`.

## Warnings

`src/alerts/watcher.ts` polls every `WA_POLL_INTERVAL_MS` and sends on transitions only: once when a
condition starts and once when it ends. A condition that flaps warns at most once per
`WA_ALERT_COOLDOWN_MS`. "API unreachable" is raised after three failed polls in a row.

The repository has no threshold policy yet (Phase 4), so temperature and humidity thresholds are
**off** unless the farm owner sets `WA_TEMP_MAX_C`, `WA_TEMP_MIN_C`, `WA_HUMIDITY_MAX_PCT` or
`WA_HUMIDITY_MIN_PCT`. There is no gas threshold: MQ-5 is uncalibrated.

## Answers (open-source LLM)

One request per message with the current snapshot as the only source of facts, sent to any server
that implements the OpenAI chat-completions route (`POST {WA_LLM_BASE_URL}/chat/completions`):
Ollama, vLLM or llama.cpp. The model is chosen with `WA_LLM_MODEL` alone; changing it needs no code
change. Without `WA_LLM_BASE_URL`, or when the server is down, slow (`WA_LLM_TIMEOUT_MS`) or returns
nothing usable, the bot replies with the plain status summary instead.

Small models follow instructions less reliably, so two checks run on every reply: reasoning inside
`<think>…</think>` is removed, and a reply that mentions `ppm` is discarded in favour of the plain
summary (MQ-5 is uncalibrated). For Qwen3 models the bot appends `/no_think` to skip reasoning.

### Recommended model

The model runs on the same GPU as the stress-detection VLM, which peaks at 8.7 GB on a 16 GB T4. If
the GPU runs out of memory, stress detection fails (`inference_gpu_oom`), so the chat model must stay
small.

| Model                    | Licence      | VRAM, Q4 at 4k context (approx.) | Use                                                          |
| ------------------------ | ------------ | -------------------------------- | ------------------------------------------------------------ |
| `qwen3:4b` (default)     | Apache-2.0   | 3.5–4 GB                         | Fits next to the VLM on a T4. Multilingual, incl. Indonesian |
| `qwen3:8b`               | Apache-2.0   | about 6.5 GB                     | Better Indonesian; only after measuring, or on ≥ 24 GB       |
| `gemma3:4b`              | Gemma Terms  | about 3.8 GB                     | Alternative if Qwen3 4B answers poorly                       |
| SEA-LION / Sahabat-AI 8B | open weights | 6–7 GB                           | Tuned for Indonesian; as heavy as Qwen3 8B                   |

The VRAM figures come from third-party guides, not from a measurement on this project's GPU. Measure
before relying on them (see below).

### Run Ollama on the GPU server

The project does not use Docker (decision 2026-11-20). Install Ollama natively (the installer from
ollama.com; on Linux it sets up a systemd service), then:

```bash
# Linux: sudo systemctl edit ollama, and add under [Service]:
#   Environment=OLLAMA_HOST=127.0.0.1:11434
#   Environment=OLLAMA_KEEP_ALIVE=-1
#   Environment=OLLAMA_NUM_PARALLEL=1
sudo systemctl restart ollama
ollama pull qwen3:4b
```

```env
# apps/whatsapp-bot/.env
WA_LLM_BASE_URL=http://localhost:11434/v1
WA_LLM_MODEL=qwen3:4b
```

`OLLAMA_KEEP_ALIVE=-1` keeps the model loaded, so its memory is reserved once instead of being
loaded and freed per message. `OLLAMA_HOST` keeps the port on localhost because Ollama has no
authentication.

Before going live, check on the real GPU:

1. `nvidia-smi` with both the VLM (`/health` = ok) and the chat model loaded: memory must stay below
   the card's total.
2. Upload a frame on `/vision` while a WhatsApp question is being answered: no `inference_gpu_oom`,
   and the frame still finishes within `INFERENCE_TIMEOUT_MS`. On Colab the "Uji beban bersama" cell of
   `colab/run_llm_colab.ipynb` does this (3 frames next to 3 questions, peak GPU memory). PyTorch keeps
   memory it has freed reserved for itself (AUDIT PV7), so measure with both models loaded and working. That timeout was measured on a T4
   without other load, so measure again.

### Borrow a Colab GPU (demo)

For a demo without an NVIDIA machine, `colab/run_llm_colab.ipynb` runs the model on a free Colab T4,
like the VLM notebook does:

1. Upload the notebook to Colab (File → Upload notebook), set the runtime to **T4 GPU**, choose
   `MODEL` and `JALANKAN_VLM` in the first cell, and **Run all**.
2. Copy the printed `WA_LLM_BASE_URL`, `WA_LLM_MODEL` and `WA_LLM_TIMEOUT_MS`, and `WA_LLM_API_KEY` from
   the last cell, into `apps/whatsapp-bot/.env` and restart the bot. The bot and the API keep running
   on your laptop.
3. Clear the last cell's output (cell menu → Clear output): it holds the full keys (AUDIT S19).

What the notebook does differently from a private server:

- The tunnel URL is public and Ollama has no authentication, so Ollama listens on `127.0.0.1` only
  and the tunnel points at a small proxy that requires `WA_LLM_API_KEY` and forwards nothing but
  `POST /v1/chat/completions` (model management such as `/api/pull` is unreachable).
- Free Colab usually gives one GPU session at a time. `JALANKAN_VLM = True` runs the VLM notebook
  (`apps/inference/colab/run_inference_colab.ipynb`, fetched from `fix/web-batch-1` until it is merged)
  first in the same session, so both share one T4; it also prints the `INFERENCE_*` lines for
  `apps/api/.env`, with the full `INFERENCE_API_KEY` in this notebook's last cell.
- It ends by checking `ollama ps` (warns unless the model is 100 % on the GPU) and by calling the
  model through the tunnel without a key (must be 401) and with it.

The session can stop at any time and the URL and key change on every run (a fixed key can be set
once in Colab Secrets as `WA_LLM_API_KEY`). While the model is unreachable the bot still sends
warnings and answers questions with the plain status summary.

Messages pass through Meta. With a self-hosted model, the question and the house data do not leave
your server for the answer; with Colab they are processed on Google's machine.

## Device control: designed, not implemented

The system has no actuators and no command endpoint, so
`WA_CONTROL_ENABLED` accepts only `false` and the bot refuses to start otherwise. Control requests
are detected by fixed rules in `src/chat/control.ts` before the LLM sees the message, so the LLM can
neither trigger nor claim an action.

To enable control in a later, separately approved phase:

1. Prerequisites outside this app: actuators on the ESP32, firmware that accepts commands, and a
   command path (an API endpoint the device polls, since telemetry is HTTP only) with acknowledgements.
2. Add a `CommandDispatcher` interface (`dispatch(deviceId, target, action) → acknowledged | failed`)
   and call it from the router where the "not available" reply is sent today.
3. Restrict control to a separate admin list (`WA_CONTROL_ADMINS`), not the whole allowlist.
4. Require a two-step confirmation: the bot repeats the command and acts only on `YA` within 60 s.
5. Write every request, confirmation and outcome to an audit log, and report the device's
   acknowledgement, not the request, as the result.
6. Keep vision output out of it: `AGENTS.md` forbids automated actions based on vision results.

## Limits

- All state is in memory: dedupe ids, chat history, rate limits, alert state and the 24-hour window
  are lost on restart. After a restart active conditions are announced again and recipients are
  treated as outside the 24-hour window.
- Warnings are detected by polling, so they arrive up to one poll interval late.
- The API has no authentication; run the bot on the same private network as the API.

## Checks

```bash
corepack pnpm --filter @agronova/whatsapp-bot typecheck
corepack pnpm --filter @agronova/whatsapp-bot test
```

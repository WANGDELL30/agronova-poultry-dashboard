// Pretend ESP32 for local tests: posts one schema-v1 reading to the API every few seconds, the same
// way a real device would (POST /api/v1/telemetry). Stop it (Ctrl+C) to make the device go offline.
//
// corepack pnpm --filter @agronova/whatsapp-bot device:fake
// corepack pnpm --filter @agronova/whatsapp-bot device:fake --scenario sensor-disconnected
// corepack pnpm --filter @agronova/whatsapp-bot device:fake --scenario hot --interval 5
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

import {
  SensorQuality,
  telemetryV1Schema,
  validTelemetryV1Example,
} from '@agronova/telemetry-schema';

const round = (value, digits) => Number(value.toFixed(digits));
const jitter = (value, spread) => value + (Math.random() * 2 - 1) * spread;

/** Each scenario changes the example reading the way a real device would report it. */
const SCENARIOS = {
  normal: (reading) => reading,
  // Raises a warning only when WA_TEMP_MAX_C is set below this value.
  hot: (reading) => ({
    ...reading,
    readings: { ...reading.readings, air_temperature_c: { raw: 38.4, filtered: 38.2 } },
  }),
  // A disconnected sensor reports no value (null), never zero.
  'sensor-disconnected': (reading) => ({
    ...reading,
    readings: { ...reading.readings, air_humidity_pct: null },
    quality: {
      ...reading.quality,
      overall: SensorQuality.DISCONNECTED,
      air_humidity: SensorQuality.DISCONNECTED,
    },
  }),
  'sensor-invalid': (reading) => ({
    ...reading,
    quality: { ...reading.quality, overall: SensorQuality.INVALID, mq5: SensorQuality.INVALID },
  }),
};

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'normal' },
    interval: { type: 'string', default: '10' },
    api: { type: 'string' },
    device: { type: 'string' },
    once: { type: 'boolean', default: false },
  },
});

const scenario = SCENARIOS[values.scenario];
if (!scenario) {
  console.error(
    `Skenario "${values.scenario}" tidak dikenal. Pilih: ${Object.keys(SCENARIOS).join(', ')}`,
  );
  process.exit(1);
}
const intervalSeconds = Number(values.interval);
if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
  console.error('--interval harus angka detik >= 1.');
  process.exit(1);
}
const apiBase = (
  values.api ??
  process.env.AGRONOVA_API_BASE_URL ??
  'http://localhost:4000'
).replace(/\/+$/, '');
const deviceId =
  values.device ?? (process.env.AGRONOVA_DEVICE_ID || validTelemetryV1Example.device_id);
const url = `${apiBase}/api/v1/telemetry`;
const startedAt = Date.now();
let sequence = 0;

function nextReading() {
  sequence += 1;
  const base = structuredClone(validTelemetryV1Example);
  const temperature = jitter(28.5, 0.3);
  const humidity = jitter(72.4, 1);
  const reading = {
    ...base,
    message_id: randomUUID(),
    device_id: deviceId,
    sequence_no: sequence,
    captured_at: new Date().toISOString(),
    device: { ...base.device, uptime_s: Math.floor((Date.now() - startedAt) / 1000) },
    readings: {
      ...base.readings,
      air_temperature_c: { raw: round(temperature + 0.2, 1), filtered: round(temperature, 1) },
      air_humidity_pct: { raw: round(humidity + 0.5, 1), filtered: round(humidity, 1) },
    },
  };
  // Fail here, with the reason, rather than as a 400 from the API.
  return telemetryV1Schema.parse(scenario(reading));
}

async function send() {
  const reading = nextReading();
  const time = new Date().toLocaleTimeString('id-ID');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reading),
    });
    const temperature = reading.readings.air_temperature_c?.filtered ?? 'null';
    console.log(
      `${time} #${reading.sequence_no} ${values.scenario}: suhu ${temperature} °C -> HTTP ${response.status}`,
    );
    if (!response.ok) console.log(await response.text());
  } catch (error) {
    console.log(`${time} API tidak dapat dihubungi di ${url}: ${error.message}`);
  }
}

console.log(
  `ESP32 tiruan "${deviceId}" -> ${url}, skenario "${values.scenario}", tiap ${intervalSeconds} dtk. Ctrl+C untuk berhenti.`,
);
await send();
if (!values.once) setInterval(send, intervalSeconds * 1000);

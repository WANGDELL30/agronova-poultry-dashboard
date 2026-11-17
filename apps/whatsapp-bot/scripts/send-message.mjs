// Simulates one incoming WhatsApp message, shaped and signed like a Meta webhook delivery, so the
// bot can be tested in console mode without a phone.
//
// corepack pnpm --filter @agronova/whatsapp-bot message:fake "gimana kondisi kandang?"
// corepack pnpm --filter @agronova/whatsapp-bot message:fake --from 6289999999999 "status"
import 'dotenv/config';
import { createHmac, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { from: { type: 'string' }, bot: { type: 'string' } },
});

const text = positionals.join(' ').trim();
if (text === '') {
  console.error('Tulis pesannya, contoh: message:fake "gimana kondisi kandang?"');
  process.exit(1);
}
// Default sender: the first number on the allowlist, so the bot answers.
const from = (values.from ?? (process.env.WA_ALLOWED_NUMBERS ?? '').split(',')[0] ?? '').replace(
  /\D/g,
  '',
);
if (from === '') {
  console.error('Isi WA_ALLOWED_NUMBERS di apps/whatsapp-bot/.env, atau pakai --from 62...');
  process.exit(1);
}
const bot = (values.bot ?? `http://localhost:${process.env.WA_BOT_PORT || 4100}`).replace(
  /\/+$/,
  '',
);

const body = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            ...(process.env.WA_PHONE_NUMBER_ID
              ? { metadata: { phone_number_id: process.env.WA_PHONE_NUMBER_ID } }
              : {}),
            messages: [
              {
                from,
                id: `wamid.fake-${randomUUID()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
});

const headers = { 'Content-Type': 'application/json' };
// The bot checks the signature whenever WA_APP_SECRET is set, so sign the same way Meta does.
if (process.env.WA_APP_SECRET) {
  headers['X-Hub-Signature-256'] =
    `sha256=${createHmac('sha256', process.env.WA_APP_SECRET).update(body).digest('hex')}`;
}
if (process.env.WA_PROVIDER === 'meta') {
  console.log('Catatan: WA_PROVIDER=meta, jadi balasan bot dikirim sungguhan lewat WhatsApp.');
}

try {
  const response = await fetch(`${bot}/webhook`, { method: 'POST', headers, body });
  console.log(`Pesan "${text}" dari ${from} -> HTTP ${response.status} ${await response.text()}`);
  if (response.ok) console.log('Lihat balasannya di terminal bot.');
} catch (error) {
  console.error(`Bot tidak dapat dihubungi di ${bot}: ${error.message}`);
  process.exit(1);
}

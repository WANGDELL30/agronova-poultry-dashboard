import { describe, expect, it } from 'vitest';

import { buildServer, type ServerOptions } from './server.js';
import { signBody } from './whatsapp/signature.js';
import type { InboundMessage } from './whatsapp/webhook-schema.js';

const SECRET = 'app-secret';
const PHONE_ID = '1234567890';

function delivery(overrides: { phoneNumberId?: string; type?: string } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: overrides.phoneNumberId ?? PHONE_ID },
              messages: [
                {
                  from: '6281234567890',
                  id: 'wamid.A',
                  timestamp: '1794884400',
                  type: overrides.type ?? 'text',
                  text: overrides.type ? undefined : { body: 'gimana kandang?' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function setup(overrides: Partial<ServerOptions> = {}) {
  const received: InboundMessage[] = [];
  const app = buildServer({
    verifyToken: 'verify-me',
    appSecret: SECRET,
    phoneNumberId: PHONE_ID,
    onMessage: (message) => received.push(message),
    health: () => ({ status: 'ok' }),
    ...overrides,
  });
  const post = (body: unknown, signature?: string) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return app.inject({
      method: 'POST',
      url: '/webhook',
      payload,
      headers: {
        'content-type': 'application/json',
        ...(signature === undefined
          ? { 'x-hub-signature-256': signBody(Buffer.from(payload), SECRET) }
          : signature === ''
            ? {}
            : { 'x-hub-signature-256': signature }),
      },
    });
  };
  return { app, received, post };
}

describe('GET /webhook (registration)', () => {
  it('echoes the challenge for the right token', async () => {
    const { app } = setup();
    const response = await app.inject(
      '/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345',
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('12345');
  });

  it('refuses a wrong token, and everything when no token is configured', async () => {
    const wrong = await setup().app.inject(
      '/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1',
    );
    expect(wrong.statusCode).toBe(403);
    const unset = await setup({ verifyToken: null }).app.inject(
      '/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=1',
    );
    expect(unset.statusCode).toBe(403);
  });
});

describe('POST /webhook', () => {
  it('accepts a signed delivery and hands over the message', async () => {
    const { received, post } = setup();
    const response = await post(delivery());
    expect(response.statusCode).toBe(200);
    expect(received).toEqual([
      {
        id: 'wamid.A',
        from: '6281234567890',
        sentAt: new Date(1794884400 * 1000),
        text: 'gimana kandang?',
      },
    ]);
  });

  it('rejects a missing or wrong signature without processing anything', async () => {
    const { received, post } = setup();
    expect((await post(delivery(), '')).statusCode).toBe(401);
    expect((await post(delivery(), 'sha256=deadbeef')).statusCode).toBe(401);
    expect((await post(delivery(), signBody(Buffer.from('other'), SECRET))).statusCode).toBe(401);
    expect(received).toEqual([]);
  });

  it('skips the signature check only when no secret is configured (console mode)', async () => {
    const { received, post } = setup({ appSecret: null });
    expect((await post(delivery(), '')).statusCode).toBe(200);
    expect(received).toHaveLength(1);
  });

  it('ignores deliveries addressed to another business number', async () => {
    const { received, post } = setup();
    const response = await post(delivery({ phoneNumberId: '999' }));
    expect(response.statusCode).toBe(200);
    expect(received).toEqual([]);
  });

  it('passes non-text messages on with text null', async () => {
    const { received, post } = setup();
    await post(delivery({ type: 'image' }));
    expect(received[0]?.text).toBeNull();
  });

  it('acknowledges status notifications that carry no messages', async () => {
    const { received, post } = setup();
    const response = await post({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }] }],
    });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual([]);
  });

  it('rejects malformed JSON and foreign payloads', async () => {
    const { post } = setup();
    expect((await post('{not json')).statusCode).toBe(400);
    expect((await post({ object: 'page', entry: [] })).statusCode).toBe(400);
  });
});

describe('GET /health', () => {
  it('reports status', async () => {
    const response = await setup().app.inject('/health');
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

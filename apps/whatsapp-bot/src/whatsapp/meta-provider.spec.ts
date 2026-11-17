import { describe, expect, it, vi } from 'vitest';

import { ConsoleProvider } from './console-provider.js';
import { MetaProvider } from './meta-provider.js';
import { MAX_TEXT_LENGTH, SessionWindow, WhatsAppSendError, maskNumber } from './provider.js';

const CONFIG = {
  accessToken: 'secret-token',
  appSecret: 'app-secret',
  verifyToken: 'verify',
  phoneNumberId: '1234567890',
  graphApiVersion: 'v23.0',
};

function setup(response: () => Response) {
  const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    response(),
  );
  const provider = new MetaProvider(CONFIG, 1000, fetchMock as typeof fetch);
  const body = () =>
    JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
  return { provider, fetchMock, body };
}

const ok = () => new Response('{"messages":[{"id":"wamid.X"}]}', { status: 200 });

describe('MetaProvider', () => {
  it('posts a text message to the phone number endpoint with the bearer token', async () => {
    const { provider, fetchMock, body } = setup(ok);
    await provider.sendText('6281234567890', 'halo');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(body()).toMatchObject({
      messaging_product: 'whatsapp',
      to: '6281234567890',
      type: 'text',
      text: { body: 'halo' },
    });
  });

  it('shortens a text above the WhatsApp limit', async () => {
    const { provider, body } = setup(ok);
    await provider.sendText('628', 'x'.repeat(MAX_TEXT_LENGTH + 50));
    expect((body().text as { body: string }).body).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('sends a template with one body parameter per value', async () => {
    const { provider, body } = setup(ok);
    await provider.sendTemplate('628', 'agronova_alert', 'id', ['Perangkat OFFLINE']);
    expect(body()).toMatchObject({
      type: 'template',
      template: {
        name: 'agronova_alert',
        language: { code: 'id' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Perangkat OFFLINE' }] }],
      },
    });
  });

  it('reports the cause Meta gives, without the access token', async () => {
    const { provider } = setup(
      () =>
        new Response('{"error":{"message":"Re-engagement message","code":131047}}', {
          status: 400,
        }),
    );
    const error = await provider.sendText('628', 'halo').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WhatsAppSendError);
    expect((error as Error).message).toContain('131047');
    expect((error as Error).message).not.toContain('secret-token');
  });

  it('reports a network failure as WhatsAppSendError', async () => {
    const provider = new MetaProvider(CONFIG, 1000, (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    await expect(provider.sendText('628', 'halo')).rejects.toBeInstanceOf(WhatsAppSendError);
  });
});

describe('ConsoleProvider', () => {
  it('prints instead of sending and masks the number', async () => {
    const lines: string[] = [];
    await new ConsoleProvider((line) => lines.push(line)).sendText('6281234567890', 'halo');
    expect(lines[0]).toContain('halo');
    expect(lines[0]).toContain('*********7890');
    expect(lines[0]).not.toContain('6281234567890');
  });
});

describe('SessionWindow', () => {
  it('is open for 24 hours after the last inbound message', () => {
    const window = new SessionWindow();
    const start = new Date('2026-11-17T00:00:00Z');
    expect(window.isOpen('628', start)).toBe(false);
    window.recordInbound('628', start);
    expect(window.isOpen('628', new Date('2026-11-17T23:59:59Z'))).toBe(true);
    expect(window.isOpen('628', new Date('2026-11-18T00:00:00Z'))).toBe(false);
    expect(maskNumber('123')).toBe('****');
  });
});

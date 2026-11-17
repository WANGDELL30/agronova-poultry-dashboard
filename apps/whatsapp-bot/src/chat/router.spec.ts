import { describe, expect, it, vi } from 'vitest';

import { NOW, RecordingProvider, TIME_ZONE, snapshot } from '../test-fixtures.js';
import { SessionWindow } from '../whatsapp/provider.js';
import type { InboundMessage } from '../whatsapp/webhook-schema.js';

import type { Assistant, AssistantInput } from './assistant.js';
import { MessageRouter, RATE_LIMIT_REPLY, TEXT_ONLY_REPLY, type RouterOptions } from './router.js';

const USER = '6281234567890';
let counter = 0;

function inbound(text: string | null, overrides: Partial<InboundMessage> = {}): InboundMessage {
  counter += 1;
  return { id: `wamid.${counter}`, from: USER, sentAt: NOW, text, ...overrides };
}

function setup(overrides: Partial<RouterOptions> = {}) {
  const provider = new RecordingProvider();
  const sessions = new SessionWindow();
  const asked: AssistantInput[] = [];
  const assistant: Assistant = {
    answer: async (input) => {
      asked.push(input);
      return `jawaban ${asked.length}`;
    },
  };
  const fetchSnapshot = vi.fn(async () => snapshot());
  const logs: string[] = [];
  const router = new MessageRouter({
    allowedNumbers: new Set([USER]),
    provider,
    sessions,
    fetchSnapshot,
    assistant,
    timeZone: TIME_ZONE,
    rateLimitPerHour: 30,
    now: () => NOW,
    log: (line) => logs.push(line),
    ...overrides,
  });
  return { router, provider, sessions, asked, fetchSnapshot, logs };
}

describe('MessageRouter', () => {
  it('answers an allowed number from a fresh snapshot', async () => {
    const { router, provider, asked, sessions } = setup();
    await router.handle(inbound('gimana kondisi kandang?'));
    expect(provider.sent).toEqual([{ kind: 'text', to: USER, body: 'jawaban 1' }]);
    expect(asked[0]?.snapshotText).toContain('Suhu udara: 28.5 °C');
    expect(sessions.isOpen(USER, NOW)).toBe(true);
  });

  it('gives a number outside the allowlist no reply and no data', async () => {
    const { router, provider, fetchSnapshot, asked } = setup();
    await router.handle(inbound('status', { from: '6289999999999' }));
    expect(provider.sent).toEqual([]);
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(asked).toEqual([]);
  });

  it('matches the allowlist regardless of how the sender number is formatted', async () => {
    const { router, provider } = setup();
    await router.handle(inbound('halo', { from: '+62 812-3456-7890' }));
    expect(provider.sent).toHaveLength(1);
  });

  it('handles a redelivered message id only once', async () => {
    const { router, provider } = setup();
    const message = inbound('status');
    await router.handle(message);
    await router.handle(message);
    expect(provider.sent).toHaveLength(1);
  });

  it('skips old redelivered messages', async () => {
    const { router, provider } = setup();
    await router.handle(inbound('status', { sentAt: new Date(NOW.getTime() - 3_600_000) }));
    expect(provider.sent).toEqual([]);
  });

  it('answers a control request with "not available" without calling the LLM', async () => {
    const { router, provider, asked, fetchSnapshot } = setup();
    await router.handle(inbound('nyalakan kipas'));
    expect(provider.sent[0]?.body).toContain('belum tersedia');
    expect(asked).toEqual([]);
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });

  it('asks for text when the message is not text', async () => {
    const { router, provider } = setup();
    await router.handle(inbound(null));
    expect(provider.sent[0]?.body).toBe(TEXT_ONLY_REPLY);
  });

  it('falls back to the plain status summary without an LLM or when it fails', async () => {
    const none = setup({ assistant: null });
    await none.router.handle(inbound('status'));
    expect(none.provider.sent[0]?.body).toContain('Perangkat AGRONOVA-ESP32-01: ONLINE');

    const failing = setup({ assistant: { answer: async () => null } });
    await failing.router.handle(inbound('status'));
    expect(failing.provider.sent[0]?.body).toContain('Suhu udara: 28.5 °C');
  });

  it('limits messages per hour', async () => {
    const { router, provider, asked } = setup({ rateLimitPerHour: 2 });
    await router.handle(inbound('satu'));
    await router.handle(inbound('dua'));
    await router.handle(inbound('tiga'));
    expect(asked).toHaveLength(2);
    expect(provider.sent[2]?.body).toBe(RATE_LIMIT_REPLY);
  });

  it('carries earlier turns into the next question, in order', async () => {
    const { router, asked } = setup();
    await Promise.all([router.handle(inbound('pertama')), router.handle(inbound('kedua'))]);
    expect(asked[0]?.history).toEqual([]);
    expect(asked[1]?.history).toEqual([{ question: 'pertama', answer: 'jawaban 1' }]);
  });

  it('logs a failure instead of rejecting', async () => {
    const { router, logs } = setup({
      fetchSnapshot: async () => {
        throw new Error('unexpected');
      },
    });
    await expect(router.handle(inbound('status'))).resolves.toBeUndefined();
    expect(logs.join('\n')).toContain('unexpected');
  });
});

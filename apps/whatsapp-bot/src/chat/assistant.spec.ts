import { describe, expect, it, vi } from 'vitest';

import {
  OpenAiCompatibleAssistant,
  SYSTEM_PROMPT,
  stripReasoning,
  violatesSensorRules,
} from './assistant.js';

const completion = (content: string | null) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function setup(
  respond: () => Response | Promise<Response>,
  options: { model?: string; apiKey?: string | null } = {},
) {
  const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => respond());
  const logs: string[] = [];
  const assistant = new OpenAiCompatibleAssistant({
    baseUrl: 'http://localhost:11434/v1/',
    model: options.model ?? 'qwen3:4b',
    apiKey: options.apiKey ?? null,
    timeoutMs: 1000,
    fetchImpl: fetchMock as typeof fetch,
    log: (line) => logs.push(line),
  });
  const request = () => {
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    return {
      url,
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as {
        model: string;
        stream: boolean;
        messages: { role: string; content: string }[];
      },
    };
  };
  return { assistant, logs, request };
}

const INPUT = { question: 'suhu berapa?', snapshotText: 'Suhu udara: 28.5 °C', history: [] };

describe('OpenAiCompatibleAssistant', () => {
  it('posts the system prompt and one user turn to /chat/completions and returns the text', async () => {
    const { assistant, request } = setup(() => completion('Suhu udara 28,5 °C.'));
    expect(await assistant.answer(INPUT)).toBe('Suhu udara 28,5 °C.');
    const { url, body, headers } = request();
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(body.model).toBe('qwen3:4b');
    expect(body.stream).toBe(false);
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.messages[0]?.content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1]?.content).toContain(
      '<data_kandang>\nSuhu udara: 28.5 °C\n</data_kandang>',
    );
    expect(body.messages[1]?.content).toContain('suhu berapa?');
    expect(body.messages[1]?.content).not.toContain('<riwayat>');
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends a bearer token only when a key is configured', async () => {
    const { assistant, request } = setup(() => completion('ok'), { apiKey: 'sk-local' });
    await assistant.answer(INPUT);
    expect(request().headers.Authorization).toBe('Bearer sk-local');
  });

  it('adds the /no_think switch for Qwen3 models only', async () => {
    const qwen = setup(() => completion('ok'));
    await qwen.assistant.answer(INPUT);
    expect(qwen.request().body.messages[1]?.content.endsWith(' /no_think')).toBe(true);
    const other = setup(() => completion('ok'), { model: 'gemma3:4b' });
    await other.assistant.answer(INPUT);
    expect(other.request().body.messages[1]?.content).not.toContain('/no_think');
  });

  it('passes earlier turns as text inside the user message', async () => {
    const { assistant, request } = setup(() => completion('ok'));
    await assistant.answer({
      ...INPUT,
      history: [{ question: 'halo', answer: 'Halo, ada yang bisa dibantu?' }],
    });
    expect(request().body.messages).toHaveLength(2);
    expect(request().body.messages[1]?.content).toContain('<riwayat>\nPetugas: halo');
  });

  it('removes model reasoning from the reply', async () => {
    const { assistant } = setup(() =>
      completion('<think>\nuser asks temperature\n</think>\n\nSuhu udara 28,5 °C.'),
    );
    expect(await assistant.answer(INPUT)).toBe('Suhu udara 28,5 °C.');
    expect(stripReasoning('reasoning without opening tag</think>Jawaban')).toBe('Jawaban');
    expect(stripReasoning('<think>only reasoning</think>')).toBe('');
  });

  it('discards a reply that reports ppm', async () => {
    const { assistant, logs } = setup(() => completion('Kadar gas sekitar 120 ppm, aman.'));
    expect(await assistant.answer(INPUT)).toBeNull();
    expect(logs.join('\n')).toContain('ppm');
    expect(violatesSensorRules('Level relatif 31,5 %')).toBe(false);
    expect(violatesSensorRules('120 PPM')).toBe(true);
  });

  it.each([
    ['an HTTP error', () => new Response('oops', { status: 500 })],
    ['invalid JSON', () => new Response('not json', { status: 200 })],
    ['a body without choices', () => new Response('{"choices":[]}', { status: 200 })],
    ['an empty reply', () => completion('')],
    ['a null reply', () => completion(null)],
  ])('returns null and logs on %s', async (_name, respond) => {
    const { assistant, logs } = setup(respond);
    expect(await assistant.answer(INPUT)).toBeNull();
    expect(logs).toHaveLength(1);
  });

  it('returns null when the server is down or times out', async () => {
    const { assistant, logs } = setup(() => {
      throw new TypeError('fetch failed');
    });
    expect(await assistant.answer(INPUT)).toBeNull();
    expect(logs[0]).toContain('fetch failed');
  });

  it('tells the model about ppm, missing values and control limits', () => {
    expect(SYSTEM_PROMPT).toMatch(/ppm/);
    expect(SYSTEM_PROMPT).toMatch(/bukan diagnosis/);
    expect(SYSTEM_PROMPT).toMatch(/tidak dapat menyalakan/);
  });
});

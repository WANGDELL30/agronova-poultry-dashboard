import { SCS_INDICATOR_KEYS } from '@agronova/vision-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InferenceClient, InferenceError } from './inference-client.js';

describe('InferenceClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends X-API-Key only when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await new InferenceClient('http://i', 1000, 's3cret')
      .classify(Buffer.from('x'), 'image/png')
      .catch(() => undefined);
    await new InferenceClient('http://i', 1000)
      .classify(Buffer.from('x'), 'image/png')
      .catch(() => undefined);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toEqual({ 'X-API-Key': 's3cret' });
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toBeUndefined();
  });

  it('maps 503 to not_ready, 401 to a rejected key, and invalid bodies to bad_response', async () => {
    const respond = (status: number, body = '{}') =>
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
    const client = new InferenceClient('http://i', 1000);
    respond(503);
    await expect(client.classify(Buffer.from('x'), 'image/png')).rejects.toMatchObject({
      code: 'inference_not_ready',
    });
    respond(401);
    await expect(client.classify(Buffer.from('x'), 'image/png')).rejects.toMatchObject({
      code: 'inference_bad_response',
      message: expect.stringContaining('API key'),
    });
    respond(200, '{"nope":1}');
    await expect(client.classify(Buffer.from('x'), 'image/png')).rejects.toBeInstanceOf(
      InferenceError,
    );
  });

  it('rejects a response whose fields contradict each other as bad_response (K2)', async () => {
    const indicators = Object.fromEntries(SCS_INDICATOR_KEYS.map((k) => [k, 'YA']));
    const body = {
      schema_version: 1,
      inference_mode: 'mock',
      model: { base_model: 'b', adapter: 'a', adapter_revision: null },
      inference_ms: 1,
      quality: { status: 'skipped', issues: ['blur'] },
      status: 'skipped_quality',
      result: {
        indicators,
        total_ya: 7,
        visible_count: 7,
        label: 'stress',
        score_stress: 1,
        confidence: 1,
      },
      raw_response: null,
      error_message: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
    );
    await expect(
      new InferenceClient('http://i', 1000).classify(Buffer.from('x'), 'image/png'),
    ).rejects.toMatchObject({ code: 'inference_bad_response' });
  });

  it('maps other 5xx answers from inference to inference_failed (R10)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(
      new InferenceClient('http://i', 1000).classify(Buffer.from('x'), 'image/png'),
    ).rejects.toMatchObject({ code: 'inference_failed', message: expect.stringContaining('500') });
  });

  it('reports health honestly: loading (503) is not ready, and a dead service is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"status":"loading","inference_mode":"real"}', { status: 503 }),
        ),
    );
    expect((await new InferenceClient('http://i', 1000).health()).status).toBe('loading');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect((await new InferenceClient('http://i', 1000).health()).status).toBe('unreachable');
  });
  it('gives up on health after its own short timeout, not the upload timeout (R13)', async () => {
    // A service that accepts the connection but never answers; only the abort signal ends it.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    const started = Date.now();
    const health = await new InferenceClient('http://i', 60_000, null, 50).health();
    expect(health.status).toBe('unreachable');
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

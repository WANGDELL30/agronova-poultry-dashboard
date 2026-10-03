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
});

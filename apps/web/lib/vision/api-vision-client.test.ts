import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiVisionClient } from './api-vision-client';
import { VisionClientError } from './vision-client';

const record = {
  schema_version: 1,
  message_id: '6f9619ff-8b86-4d11-b42d-00c04fc964ff',
  camera_id: 'cam-01',
  kandang_id: null,
  captured_at: '2026-10-01T01:00:00.000Z',
  received_at: '2026-10-01T01:00:01.000Z',
  inference_mode: 'real',
  model: null,
  inference_ms: null,
  quality: null,
  status: 'inference_error',
  result: null,
  raw_response: null,
  error_message: 'down',
  vote: {
    status: 'ignored_no_result',
    trigger_alert: false,
    window_size: 5,
    window_filled: 0,
    majority_label: null,
    majority_count: null,
  },
  image_available: true,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const input = {
  file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
  cameraId: 'cam-01',
  capturedAt: record.captured_at,
};

describe('ApiVisionClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts multipart form data and validates the record against the v1 contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(record, 201));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiVisionClient('http://api.test/');
    expect((await client.submit(input)).status).toBe('inference_error');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/vision/frames');
    expect((init.body as FormData).get('camera_id')).toBe('cam-01');
    expect(client.imageUrl(record as never)).toBe(
      `http://api.test/api/v1/vision/results/${record.message_id}/image`,
    );
  });

  it('surfaces the API error code and message_id (e.g. 504 inference_timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ error: 'inference_timeout', message: 'slow', message_id: 'abc' }, 504),
        ),
    );
    await expect(new ApiVisionClient('http://api.test').submit(input)).rejects.toMatchObject({
      code: 'inference_timeout',
      messageId: 'abc',
    });
  });

  it('reports network failure and rejects responses that violate the contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    await expect(new ApiVisionClient('http://api.test').list()).rejects.toBeInstanceOf(
      VisionClientError,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([{ ...record, status: 'classified' }])));
    await expect(new ApiVisionClient('http://api.test').list()).rejects.toThrow();
  });
});

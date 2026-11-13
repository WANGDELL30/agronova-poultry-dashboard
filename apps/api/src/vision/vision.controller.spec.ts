import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fastifyMultipart from '@fastify/multipart';
import { SCS_INDICATOR_KEYS, type InferenceResponseV1 } from '@agronova/vision-schema';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ImageStore } from './image-store.js';
import { InferenceClient, InferenceError } from './inference-client.js';
import type { VisionConfig } from './vision-config.js';
import { VisionController } from './vision.controller.js';
import { InMemoryVisionRepository } from './vision.repository.js';
import { VisionService } from './vision.service.js';
import { VISION_CONFIG } from './vision.tokens.js';

const indicators = Object.fromEntries(SCS_INDICATOR_KEYS.map((k) => [k, 'TIDAK'])) as never;
const okResponse: InferenceResponseV1 = {
  schema_version: 1,
  inference_mode: 'mock',
  model: { base_model: 'm', adapter: 'a', adapter_revision: null },
  inference_ms: 1,
  quality: { status: 'ok', issues: [] },
  status: 'classified',
  result: {
    indicators,
    total_ya: 0,
    visible_count: 7,
    label: 'not_stress',
    score_stress: 0,
    confidence: 1,
  },
  raw_response: null,
  error_message: null,
};

describe('VisionController (HTTP)', () => {
  let app: NestFastifyApplication;
  let dir: string;
  const classify = vi.fn();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vision-http-'));
    const config: VisionConfig = {
      inferenceUrl: 'x',
      inferenceTimeoutMs: 1000,
      inferenceHealthTimeoutMs: 1000,
      inferenceApiKey: null,
      imageDir: dir,
      maxImageBytes: 100,
    };
    const service = new VisionService(new InMemoryVisionRepository(), new ImageStore(dir), {
      classify,
      health: vi.fn(),
    } as unknown as InferenceClient);
    @Module({
      controllers: [VisionController],
      providers: [
        { provide: VisionService, useValue: service },
        { provide: VISION_CONFIG, useValue: config },
      ],
    })
    class TestModule {}
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.register(fastifyMultipart);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function upload(fields: Record<string, string>, file?: { data: string; type: string }) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (file) form.append('image', new Blob([file.data], { type: file.type }), 'f');
    const res = new Response(form);
    return app.inject({
      method: 'POST',
      url: '/api/v1/vision/frames',
      headers: { 'content-type': res.headers.get('content-type') ?? '' },
      payload: Buffer.from(await res.arrayBuffer()),
    });
  }
  const valid = { camera_id: 'cam-01', captured_at: '2026-10-01T01:00:00.000Z' };

  it('accepts a frame, returns the record and serves the stored image back', async () => {
    classify.mockResolvedValueOnce(okResponse);
    const res = await upload(valid, { data: 'abc', type: 'image/jpeg' });
    expect(res.statusCode).toBe(201);
    const record = res.json();
    expect(record).toMatchObject({
      status: 'classified',
      camera_id: 'cam-01',
      image_available: true,
    });
    const img = await app.inject({
      method: 'GET',
      url: `/api/v1/vision/results/${record.message_id}/image`,
    });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.body).toBe('abc');
  });

  it('alerts after 5 uploads of stress frames with 3-4 YA; skipped and undefined frames do not vote (K1, K2)', async () => {
    const stress = (ya: number): InferenceResponseV1 => ({
      ...okResponse,
      result: {
        indicators: Object.fromEntries(
          SCS_INDICATOR_KEYS.map((k, i) => [k, i < ya ? 'YA' : 'TIDAK']),
        ) as never,
        total_ya: ya,
        visible_count: 7,
        label: 'stress',
        score_stress: ya / 7,
        confidence: ya / 7,
      },
    });
    const skipped: InferenceResponseV1 = {
      ...okResponse,
      quality: { status: 'skipped', issues: ['blur'] },
      status: 'skipped_quality',
      result: null,
    };
    const undetermined: InferenceResponseV1 = {
      ...okResponse,
      result: {
        indicators: Object.fromEntries(
          SCS_INDICATOR_KEYS.map((k, i) => [k, i < 3 ? 'TIDAK_TERLIHAT' : 'TIDAK']),
        ) as never,
        total_ya: 0,
        visible_count: 4,
        label: 'undefined',
        score_stress: 0,
        confidence: null,
      },
    };
    const sequence = [stress(3), stress(4), skipped, stress(3), undetermined, stress(4), stress(3)];
    // Distinct received_at per upload, so arrival order is not left to the random tie-break (R14).
    vi.useFakeTimers({ toFake: ['Date'] });
    const votes = [];
    try {
      for (const [i, response] of sequence.entries()) {
        vi.setSystemTime(new Date(Date.UTC(2026, 9, 1, 2, 0, i)));
        classify.mockResolvedValueOnce(response);
        const res = await upload(
          { ...valid, camera_id: 'cam-vote' },
          { data: 'a', type: 'image/png' },
        );
        expect(res.statusCode).toBe(201);
        votes.push(res.json().vote);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(votes.map((v) => [v.status, v.window_filled])).toEqual([
      ['waiting_window', 1],
      ['waiting_window', 2],
      ['ignored_no_result', 2],
      ['waiting_window', 3],
      ['ignored_undefined', 3],
      ['waiting_window', 4],
      ['alert', 5],
    ]);
    expect(votes.at(-1)).toMatchObject({ trigger_alert: true, majority_count: 5 });
  });

  it('rejects missing metadata (400), wrong type (415), oversize (413), missing image (400)', async () => {
    expect((await upload({ camera_id: 'c' }, { data: 'a', type: 'image/png' })).statusCode).toBe(
      400,
    );
    expect((await upload(valid, { data: 'a', type: 'text/plain' })).statusCode).toBe(415);
    expect((await upload(valid, { data: 'x'.repeat(200), type: 'image/png' })).statusCode).toBe(
      413,
    );
    expect((await upload(valid)).statusCode).toBe(400);
  });

  it('answers 413 image_too_large when inference rejects the pixel count, storing nothing (R2)', async () => {
    const before = (
      await app.inject({ method: 'GET', url: '/api/v1/vision/results?limit=100' })
    ).json().length;
    classify.mockRejectedValueOnce(new InferenceError('image_too_large', 'too many pixels'));
    const res = await upload(valid, { data: 'a', type: 'image/png' });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: 'image_too_large' });
    const after = (
      await app.inject({ method: 'GET', url: '/api/v1/vision/results?limit=100' })
    ).json().length;
    expect(after).toBe(before);
  });

  it('maps inference timeout to 504 and unreachable to 502 with the stored message_id', async () => {
    classify.mockRejectedValueOnce(new InferenceError('inference_timeout', 'slow'));
    const timeout = await upload(valid, { data: 'a', type: 'image/png' });
    expect(timeout.statusCode).toBe(504);
    expect(timeout.json()).toMatchObject({ error: 'inference_timeout' });
    classify.mockRejectedValueOnce(new InferenceError('inference_unreachable', 'down'));
    expect((await upload(valid, { data: 'a', type: 'image/png' })).statusCode).toBe(502);
  });

  it('returns specific error codes for wrong type, oversize and more than one file (R10)', async () => {
    const wrongType = await upload(valid, { data: 'GIF89a', type: 'image/gif' });
    expect(wrongType.statusCode).toBe(415);
    expect(wrongType.json()).toMatchObject({ error: 'unsupported_image_type' });

    const tooLarge = await upload(valid, { data: 'x'.repeat(200), type: 'image/png' });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json()).toMatchObject({ error: 'image_too_large' });

    const form = new FormData();
    for (const [k, v] of Object.entries(valid)) form.append(k, v);
    form.append('image', new Blob(['a'], { type: 'image/png' }), 'a');
    form.append('image', new Blob(['b'], { type: 'image/png' }), 'b');
    const res = new Response(form);
    const twoFiles = await app.inject({
      method: 'POST',
      url: '/api/v1/vision/frames',
      headers: { 'content-type': res.headers.get('content-type') ?? '' },
      payload: Buffer.from(await res.arrayBuffer()),
    });
    expect(twoFiles.statusCode).toBe(400);
    expect(twoFiles.json()).toMatchObject({ error: 'image_required' });
  });

  it('maps a 5xx inference failure to inference_failed (R10)', async () => {
    classify.mockRejectedValueOnce(new InferenceError('inference_failed', 'CUDA OOM'));
    const res = await upload(valid, { data: 'a', type: 'image/png' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: 'inference_failed' });
  });

  it('answers 503 + Retry-After when the model is not ready and stores nothing (R10)', async () => {
    const before = (
      await app.inject({ method: 'GET', url: '/api/v1/vision/results?limit=100' })
    ).json();
    classify.mockRejectedValueOnce(new InferenceError('inference_not_ready', 'model loading'));
    const res = await upload(valid, { data: 'a', type: 'image/png' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.json()).toMatchObject({ error: 'inference_not_ready' });
    expect(res.json().message_id).toBeUndefined();
    const after = (
      await app.inject({ method: 'GET', url: '/api/v1/vision/results?limit=100' })
    ).json();
    expect(after).toHaveLength(before.length);
  });

  it('rejects an empty image with 400 before storing anything (R11)', async () => {
    const list = async () =>
      (await app.inject({ method: 'GET', url: '/api/v1/vision/results?limit=100' })).json();
    const before = await list();
    const filesBefore = await readdir(dir);
    classify.mockClear();

    const res = await upload(valid, { data: '', type: 'image/jpeg' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'image_empty' });
    expect(classify).not.toHaveBeenCalled();
    expect(await list()).toHaveLength(before.length);
    expect(await readdir(dir)).toEqual(filesBefore);
  });

  it('never resolves non-UUID image ids to files', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/vision/results/..%2Fsecret/image',
    });
    expect(res.statusCode).toBe(404);
  });

  it('validates the list limit', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/vision/results?limit=0' })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/vision/results?limit=5' })).statusCode,
    ).toBe(200);
  });

  it('rejects non-decimal limits and repeated query parameters (H10, R17)', async () => {
    const status = async (query: string) =>
      (await app.inject({ method: 'GET', url: `/api/v1/vision/results?${query}` })).statusCode;
    for (const query of ['limit=0x10', 'limit=1e2', 'limit=%2010%20', 'limit=5&limit=6']) {
      expect(await status(query), query).toBe(400);
    }
    expect(await status('camera_id=cam-01&camera_id=cam-01')).toBe(400);
    expect(await status('camera_id=cam-01&limit=100')).toBe(200);
  });

  it('still filters by camera_id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/vision/results?camera_id=cam-01' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
    const none = await app.inject({ method: 'GET', url: '/api/v1/vision/results?camera_id=zzz' });
    expect(none.json()).toEqual([]);
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
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

  it('maps inference timeout to 504 and unreachable to 502 with the stored message_id', async () => {
    classify.mockRejectedValueOnce(new InferenceError('inference_timeout', 'slow'));
    const timeout = await upload(valid, { data: 'a', type: 'image/png' });
    expect(timeout.statusCode).toBe(504);
    expect(timeout.json()).toMatchObject({ error: 'inference_timeout' });
    classify.mockRejectedValueOnce(new InferenceError('inference_unreachable', 'down'));
    expect((await upload(valid, { data: 'a', type: 'image/png' })).statusCode).toBe(502);
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
});

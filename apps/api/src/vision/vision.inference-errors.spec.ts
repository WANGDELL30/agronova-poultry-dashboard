import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fastifyMultipart from '@fastify/multipart';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ImageStore } from './image-store.js';
import { InferenceClient } from './inference-client.js';
import type { VisionConfig } from './vision-config.js';
import { VisionController } from './vision.controller.js';
import { InMemoryVisionRepository } from './vision.repository.js';
import { VisionService } from './vision.service.js';
import { VISION_CONFIG } from './vision.tokens.js';

/**
 * Batch 6 integration: the real InferenceClient talks to a fake inference service (stubbed fetch),
 * so each inference failure must reach the HTTP client as its own contract code (R12, H11).
 */
describe('inference failures over HTTP (R12, H11)', () => {
  let app: NestFastifyApplication;
  let dir: string;
  let service: VisionService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vision-errors-'));
    const config: VisionConfig = {
      inferenceUrl: 'http://inference.test',
      inferenceTimeoutMs: 1000,
      inferenceHealthTimeoutMs: 1000,
      inferenceApiKey: null,
      imageDir: dir,
      maxImageBytes: 100,
    };
    service = new VisionService(
      new InMemoryVisionRepository(),
      new ImageStore(dir),
      new InferenceClient(config.inferenceUrl, config.inferenceTimeoutMs),
    );
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
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function upload() {
    const form = new FormData();
    form.append('camera_id', 'cam-err');
    form.append('captured_at', '2026-10-01T01:00:00.000Z');
    form.append('image', new Blob(['a'], { type: 'image/png' }), 'f');
    const res = new Response(form);
    return app.inject({
      method: 'POST',
      url: '/api/v1/vision/frames',
      headers: { 'content-type': res.headers.get('content-type') ?? '' },
      payload: Buffer.from(await res.arrayBuffer()),
    });
  }

  it.each([
    [503, { error: 'model_not_ready', status: 'loading' }, 'inference_not_ready', 503, false],
    [503, { error: 'model_not_ready', status: 'error' }, 'inference_unavailable', 503, false],
    [503, { error: 'gpu_oom' }, 'inference_gpu_oom', 503, true],
    [500, { error: 'backend_error' }, 'inference_failed', 502, true],
  ])('inference %i %j -> API %s', async (inferenceStatus, body, code, httpStatus, stored) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: inferenceStatus })),
    );
    const before = (await service.list('cam-err', 100)).length;
    const res = await upload();
    expect(res.statusCode).toBe(httpStatus);
    expect(res.json()).toMatchObject({ error: code });
    const records = await service.list('cam-err', 100);
    expect(records.length - before).toBe(stored ? 1 : 0);
    if (stored) {
      expect(records[0]).toMatchObject({ status: 'inference_error', result: null });
      expect(res.json().message_id).toBe(records[0]!.message_id);
    }
  });
});

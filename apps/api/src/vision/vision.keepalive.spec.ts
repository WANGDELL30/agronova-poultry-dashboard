import { Agent, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fastifyMultipart from '@fastify/multipart';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ImageStore } from './image-store.js';
import type { InferenceClient } from './inference-client.js';
import type { VisionConfig } from './vision-config.js';
import { VisionController } from './vision.controller.js';
import { InMemoryVisionRepository } from './vision.repository.js';
import { VisionService } from './vision.service.js';
import { VISION_CONFIG } from './vision.tokens.js';

/**
 * AUDIT R3: an error thrown while the multipart body is still streaming must not leave the
 * keep-alive connection unusable. Needs a real socket, so the app listens instead of inject().
 */
describe('VisionController keep-alive after a multipart error (R3)', () => {
  let app: NestFastifyApplication;
  let dir: string;
  let port: number;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vision-keepalive-'));
    const config: VisionConfig = {
      inferenceUrl: 'x',
      inferenceTimeoutMs: 1000,
      inferenceHealthTimeoutMs: 1000,
      inferenceApiKey: null,
      imageDir: dir,
      maxImageBytes: 1024 * 1024,
    };
    const service = new VisionService(new InMemoryVisionRepository(), new ImageStore(dir), {
      classify: vi.fn(),
      health: vi.fn().mockResolvedValue({ status: 'ready', inference_mode: 'mock', detail: null }),
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
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  const big = 'x'.repeat(330 * 1024);
  const fields = { camera_id: 'cam-01', captured_at: '2026-10-01T01:00:00.000Z' };

  async function multipart(files: Array<{ field: string; data: string; type: string }>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const file of files)
      form.append(file.field, new Blob([file.data], { type: file.type }), 'f');
    const res = new Response(form);
    return {
      contentType: res.headers.get('content-type') ?? '',
      body: Buffer.from(await res.arrayBuffer()),
    };
  }

  function send(
    agent: Agent,
    options: { method: string; path: string; headers?: Record<string, string>; body?: Buffer },
  ): Promise<{ status: number; connection: string | undefined }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          agent,
          method: options.method,
          path: options.path,
          headers: options.headers,
        },
        (res) => {
          res.resume();
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, connection: res.headers.connection }),
          );
        },
      );
      req.setTimeout(3_000, () => req.destroy(new Error('request hung')));
      req.on('error', reject);
      req.end(options.body);
    });
  }

  const cases = [
    {
      name: 'unsupported type (415)',
      status: 415,
      connection: 'keep-alive',
      files: [{ field: 'image', data: big, type: 'image/gif' }],
    },
    {
      name: 'wrong field name (400)',
      status: 400,
      connection: 'keep-alive',
      files: [{ field: 'photo', data: big, type: 'image/png' }],
    },
    {
      name: 'second file (400)',
      status: 400,
      // The multipart iterator fails on the files limit, so the API closes the connection.
      connection: 'close',
      files: [
        { field: 'image', data: 'a', type: 'image/png' },
        { field: 'image', data: big, type: 'image/png' },
      ],
    },
  ];

  for (const testCase of cases) {
    it(`serves the next request on the same connection after ${testCase.name}`, async () => {
      const agent = new Agent({ keepAlive: true, maxSockets: 1 });
      try {
        const { contentType, body } = await multipart(testCase.files);
        const first = await send(agent, {
          method: 'POST',
          path: '/api/v1/vision/frames',
          headers: { 'content-type': contentType, 'content-length': String(body.length) },
          body,
        });
        expect(first).toEqual({ status: testCase.status, connection: testCase.connection });
        const second = await send(agent, { method: 'GET', path: '/api/v1/vision/health' });
        expect(second.status).toBe(200);
      } finally {
        agent.destroy();
      }
    });
  }
});

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fastifyMultipart from '@fastify/multipart';
import {
  SCS_INDICATOR_KEYS,
  visionResultV1Schema,
  type InferenceResponseV1,
  type VisionResultV1,
} from '@agronova/vision-schema';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { matchesImageSignature } from './image-signature.js';
import { ImageStore } from './image-store.js';
import type { InferenceClient } from './inference-client.js';
import {
  UploadLimiter,
  authenticateUpload,
  loadUploadPolicy,
  type UploadPolicy,
} from './upload-policy.js';
import type { VisionConfig } from './vision-config.js';
import { VisionController } from './vision.controller.js';
import { InMemoryVisionRepository } from './vision.repository.js';
import { VisionService } from './vision.service.js';
import { VISION_CONFIG, VISION_UPLOAD_POLICY } from './vision.tokens.js';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (extra = 'a') => new Uint8Array([...PNG, ...new TextEncoder().encode(extra)]);
const KEY_A = 'camera-key-a-0123456789';
const KEY_B = 'camera-key-b-0123456789';

describe('loadUploadPolicy (S2)', () => {
  it('uses the agreed defaults and no camera keys when nothing is set', () => {
    expect(loadUploadPolicy({})).toEqual({
      cameraKeys: null,
      keylessPerIpPerHour: 10,
      keylessPerHour: 60,
      cameraMinIntervalMs: 10_000,
      maxCameraRecords: 2000,
      maxManualRecords: 200,
    });
  });

  it('reads camera keys and limits, and rejects bad values without echoing keys', () => {
    const policy = loadUploadPolicy({
      VISION_CAMERA_KEYS: `cam-a=${KEY_A}`,
      VISION_CAMERA_INTERVAL_MS: '0',
      VISION_MAX_MANUAL_RECORDS: '5',
    });
    expect([...(policy.cameraKeys ?? [])]).toEqual([['cam-a', KEY_A]]);
    expect(policy.cameraMinIntervalMs).toBe(0);
    expect(policy.maxManualRecords).toBe(5);
    expect(() => loadUploadPolicy({ VISION_CAMERA_KEYS: 'cam-a=short' })).toThrow(
      /VISION_CAMERA_KEYS.*16 characters/,
    );
    expect(() => loadUploadPolicy({ VISION_CAMERA_KEYS: `${'c'.repeat(65)}=${KEY_A}` })).toThrow(
      /camera_id of 1 to 64/,
    );
    for (const [name, value] of [
      ['VISION_MANUAL_UPLOADS_PER_IP_PER_HOUR', '0'],
      ['VISION_MANUAL_UPLOADS_PER_HOUR', '1e3'],
      ['VISION_MAX_CAMERA_RECORDS', '-1'],
    ]) {
      expect(() => loadUploadPolicy({ [name!]: value })).toThrow(new RegExp(name!));
    }
  });

  it('authenticates a key before the body is read', () => {
    const policy = loadUploadPolicy({ VISION_CAMERA_KEYS: `cam-a=${KEY_A}` });
    expect(authenticateUpload(policy, KEY_A)).toEqual({ kind: 'camera', cameraId: 'cam-a' });
    expect(authenticateUpload(policy, 'wrong-key-0123456789')).toEqual({ kind: 'invalid_key' });
    expect(authenticateUpload(policy, undefined)).toEqual({ kind: 'keyless' });
    // Without configured keys there is nothing to check a header against.
    expect(authenticateUpload(loadUploadPolicy({}), KEY_A)).toEqual({ kind: 'keyless' });
  });
});

describe('UploadLimiter (S2)', () => {
  const policy = { ...loadUploadPolicy({}), keylessPerIpPerHour: 2, keylessPerHour: 3 };

  it('limits keyless uploads per IP and globally in a sliding hour', () => {
    const limiter = new UploadLimiter(policy);
    const t0 = 1_000_000;
    expect(limiter.admitKeyless('1.1.1.1', t0).ok).toBe(true);
    expect(limiter.admitKeyless('1.1.1.1', t0 + 1).ok).toBe(true);
    expect(limiter.admitKeyless('1.1.1.1', t0 + 2)).toEqual({ ok: false, retryAfterSeconds: 3600 });
    expect(limiter.admitKeyless('2.2.2.2', t0 + 3).ok).toBe(true);
    // Global limit of 3 reached, even for a new IP.
    expect(limiter.admitKeyless('3.3.3.3', t0 + 4).ok).toBe(false);
    // A refused upload is not counted: one hour after the first, a slot opens again.
    expect(limiter.admitKeyless('1.1.1.1', t0 + 3_600_001).ok).toBe(true);
  });

  it('enforces the minimum interval per authenticated camera', () => {
    const limiter = new UploadLimiter(policy);
    expect(limiter.admitCamera('cam-a', 0).ok).toBe(true);
    expect(limiter.admitCamera('cam-a', 4_000)).toEqual({ ok: false, retryAfterSeconds: 6 });
    expect(limiter.admitCamera('cam-b', 4_000).ok).toBe(true);
    expect(limiter.admitCamera('cam-a', 10_000).ok).toBe(true);
  });
});

describe('matchesImageSignature (S11)', () => {
  it('accepts the three signatures and rejects anything else', () => {
    expect(matchesImageSignature(png(), 'image/png')).toBe(true);
    expect(matchesImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(
      true,
    );
    const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]);
    expect(matchesImageSignature(webp, 'image/webp')).toBe(true);
    expect(matchesImageSignature(new TextEncoder().encode('<html>'), 'image/png')).toBe(false);
    expect(matchesImageSignature(png(), 'image/jpeg')).toBe(false); // wrong declared type
    expect(matchesImageSignature(new Uint8Array([0x89, 0x50]), 'image/png')).toBe(false); // short
    expect(matchesImageSignature(png(), 'image/gif')).toBe(false);
  });
});

describe('InMemoryVisionRepository caps per source (S2)', () => {
  it('evicts the oldest records of the same source only, and reports their ids', async () => {
    const repository = new InMemoryVisionRepository({ camera: 2, manual: 1 });
    const record = (id: number, source: 'camera' | 'manual') =>
      ({
        message_id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
        camera_id: 'cam',
        source,
        received_at: `2026-11-22T00:00:0${id}.000Z`,
        result: null,
      }) as unknown as VisionResultV1;
    expect(await repository.insert(record(1, 'camera'))).toEqual([]);
    expect(await repository.insert(record(2, 'manual'))).toEqual([]);
    expect(await repository.insert(record(3, 'camera'))).toEqual([]);
    expect(await repository.insert(record(4, 'camera'))).toEqual([record(1, 'camera').message_id]);
    expect(await repository.insert(record(5, 'manual'))).toEqual([record(2, 'manual').message_id]);
    expect((await repository.list(undefined, 10)).map((r) => r.message_id.slice(-1))).toEqual([
      '5',
      '4',
      '3',
    ]);
  });
});

const stressResponse: InferenceResponseV1 = {
  schema_version: 1,
  inference_mode: 'mock',
  model: { base_model: 'm', adapter: 'a', adapter_revision: null },
  inference_ms: 1,
  quality: { status: 'ok', issues: [] },
  status: 'classified',
  result: {
    indicators: Object.fromEntries(
      SCS_INDICATOR_KEYS.map((k, i) => [k, i < 4 ? 'YA' : 'TIDAK']),
    ) as never,
    total_ya: 4,
    visible_count: 7,
    label: 'stress',
    score_stress: 4 / 7,
    confidence: 4 / 7,
  },
  raw_response: null,
  error_message: null,
};

async function startApp(policy: UploadPolicy, repository = new InMemoryVisionRepository()) {
  const dir = await mkdtemp(join(tmpdir(), 'vision-policy-'));
  const config: VisionConfig = {
    inferenceUrl: 'x',
    inferenceTimeoutMs: 1000,
    inferenceHealthTimeoutMs: 1000,
    inferenceApiKey: null,
    imageDir: dir,
    maxImageBytes: 1000,
  };
  const classify = vi.fn().mockResolvedValue(stressResponse);
  const service = new VisionService(repository, new ImageStore(dir), {
    classify,
    health: vi.fn(),
  } as unknown as InferenceClient);
  @Module({
    controllers: [VisionController],
    providers: [
      { provide: VisionService, useValue: service },
      { provide: VISION_CONFIG, useValue: config },
      { provide: VISION_UPLOAD_POLICY, useValue: policy },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
    logger: false,
  });
  app.setGlobalPrefix('api/v1');
  await app.register(fastifyMultipart);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  let second = 0;
  const upload = async (
    options: {
      key?: string;
      cameraId?: string;
      image?: Uint8Array;
      type?: string;
      extraFields?: Record<string, string>;
      ip?: string;
    } = {},
  ) => {
    const form = new FormData();
    form.append('camera_id', options.cameraId ?? 'cam-a');
    form.append('captured_at', '2026-11-22T01:00:00.000Z');
    for (const [k, v] of Object.entries(options.extraFields ?? {})) form.append(k, v);
    form.append(
      'image',
      new Blob([options.image ?? png()], { type: options.type ?? 'image/png' }),
      'f',
    );
    const res = new Response(form);
    // Distinct received_at per upload, so arrival order is deterministic (R14).
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 22, 2, 0, 0) + (second += 20) * 1000));
    return app.inject({
      method: 'POST',
      url: '/api/v1/vision/frames',
      remoteAddress: options.ip ?? '203.0.113.1',
      headers: {
        'content-type': res.headers.get('content-type') ?? '',
        ...(options.key ? { 'x-camera-key': options.key } : {}),
      },
      payload: Buffer.from(await res.arrayBuffer()),
    });
  };
  const close = async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  };
  return { app, upload, close, dir, classify };
}

describe('POST /vision/frames with camera keys configured (S2)', () => {
  let ctx: Awaited<ReturnType<typeof startApp>>;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    ctx = await startApp({
      ...loadUploadPolicy({ VISION_CAMERA_KEYS: `cam-a=${KEY_A},cam-b=${KEY_B}` }),
      keylessPerIpPerHour: 3,
      keylessPerHour: 100,
    });
  });
  afterAll(async () => {
    await ctx.close();
    vi.useRealTimers();
  });

  it('classifies a keyless upload as manual: it never votes or alerts, and keeps cameras clean', async () => {
    // Four camera stress frames: window 4/5, no alert yet.
    for (let i = 0; i < 4; i += 1) {
      const res = await ctx.upload({ key: KEY_A });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ source: 'camera' });
    }
    const manual = await ctx.upload({ ip: '198.51.100.7' });
    expect(manual.statusCode).toBe(201);
    const record = visionResultV1Schema.parse(manual.json());
    expect(record).toMatchObject({
      source: 'manual',
      status: 'classified',
      result: { label: 'stress' },
      vote: { status: 'ignored_manual', trigger_alert: false, window_filled: 4 },
    });
    // The manual stress frame did not fill the window: the fifth camera frame makes the alert.
    const fifth = await ctx.upload({ key: KEY_A });
    expect(fifth.json().vote).toMatchObject({ status: 'alert', window_filled: 5 });
  });

  it('rejects an unknown key with 401 before reading the body, and a foreign camera_id with 403', async () => {
    const bad = await ctx.upload({ key: 'not-a-camera-key-0000' });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ error: 'invalid_camera_key' });
    expect(bad.headers.connection).toBe('close');
    const foreign = await ctx.upload({ key: KEY_B, cameraId: 'cam-a' });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json()).toMatchObject({ error: 'camera_id_mismatch' });
  });

  it('answers 429 + Retry-After when a camera sends faster than the minimum interval', async () => {
    const first = await ctx.upload({ key: KEY_B, cameraId: 'cam-b' });
    expect(first.statusCode).toBe(201);
    // Each upload advances the clock by 20 s; step back to 5 s after the last accepted frame.
    vi.setSystemTime(new Date(Date.now() - 15_000));
    const form = new FormData();
    form.append('camera_id', 'cam-b');
    form.append('captured_at', '2026-11-22T01:00:00.000Z');
    form.append('image', new Blob([png()], { type: 'image/png' }), 'f');
    const res = new Response(form);
    const tooSoon = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/vision/frames',
      headers: { 'content-type': res.headers.get('content-type') ?? '', 'x-camera-key': KEY_B },
      payload: Buffer.from(await res.arrayBuffer()),
    });
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json()).toMatchObject({ error: 'upload_rate_limited' });
    expect(Number(tooSoon.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rate limits keyless uploads per IP with 429 + Retry-After, storing nothing', async () => {
    const ip = '192.0.2.50';
    for (let i = 0; i < 3; i += 1) expect((await ctx.upload({ ip })).statusCode).toBe(201);
    const files = (await readdir(ctx.dir)).length;
    const limited = await ctx.upload({ ip });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: 'upload_rate_limited' });
    expect(limited.headers['retry-after']).toBeDefined();
    expect((await readdir(ctx.dir)).length).toBe(files);
    // Another IP is not affected.
    expect((await ctx.upload({ ip: '192.0.2.51' })).statusCode).toBe(201);
  });
});

describe('POST /vision/frames without camera keys keeps every upload a camera frame', () => {
  let ctx: Awaited<ReturnType<typeof startApp>>;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    ctx = await startApp({ ...loadUploadPolicy({}), keylessPerIpPerHour: 2 });
  });
  afterAll(async () => {
    await ctx.close();
    vi.useRealTimers();
  });

  it('votes as before (demo without a camera gateway), but still limits per IP', async () => {
    const first = await ctx.upload();
    expect(first.json()).toMatchObject({ source: 'camera', vote: { status: 'waiting_window' } });
    // A camera key header is ignored when no keys are configured.
    expect((await ctx.upload({ key: KEY_A })).json()).toMatchObject({ source: 'camera' });
    expect((await ctx.upload()).statusCode).toBe(429);
  });
});

describe('POST /vision/frames form limits and content check (S7, S11)', () => {
  let ctx: Awaited<ReturnType<typeof startApp>>;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    ctx = await startApp(loadUploadPolicy({ VISION_MANUAL_UPLOADS_PER_IP_PER_HOUR: '1000' }));
  });
  afterAll(async () => {
    await ctx.close();
    vi.useRealTimers();
  });

  it('rejects extra form fields and an oversized field with 400 invalid_metadata', async () => {
    const extra = await ctx.upload({ extraFields: { kandang_id: 'k1', note: 'x' } });
    expect(extra.statusCode).toBe(400);
    expect(extra.json()).toMatchObject({ error: 'invalid_metadata' });
    const long = await ctx.upload({ extraFields: { kandang_id: 'k'.repeat(300) } });
    expect(long.statusCode).toBe(400);
    expect(long.json()).toMatchObject({ error: 'invalid_metadata' });
    // The three expected fields together are fine.
    expect((await ctx.upload({ extraFields: { kandang_id: 'k1' } })).statusCode).toBe(201);
  });

  it('rejects bytes that do not match the declared image type with 415, storing nothing', async () => {
    const before = await readdir(ctx.dir);
    const html = await ctx.upload({ image: new TextEncoder().encode('<html>hi</html>') });
    expect(html.statusCode).toBe(415);
    expect(html.json()).toMatchObject({ error: 'unsupported_image_type' });
    const mislabelled = await ctx.upload({ image: png(), type: 'image/jpeg' });
    expect(mislabelled.statusCode).toBe(415);
    expect(await readdir(ctx.dir)).toEqual(before);
  });
});

describe('record caps delete the evicted images too (S2)', () => {
  it('keeps at most maxManualRecords manual frames on disk', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const policy = {
      ...loadUploadPolicy({ VISION_CAMERA_KEYS: `cam-a=${KEY_A}` }),
      keylessPerIpPerHour: 100,
      maxManualRecords: 2,
    };
    const ctx = await startApp(
      policy,
      new InMemoryVisionRepository({ camera: policy.maxCameraRecords, manual: 2 }),
    );
    try {
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) ids.push((await ctx.upload()).json().message_id as string);
      const files = await readdir(ctx.dir);
      expect(files).toHaveLength(2);
      expect(files.some((f) => f.startsWith(ids[0]!))).toBe(false);
      const gone = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/vision/results/${ids[0]}/image`,
      });
      expect(gone.statusCode).toBe(404);
    } finally {
      await ctx.close();
      vi.useRealTimers();
    }
  });
});

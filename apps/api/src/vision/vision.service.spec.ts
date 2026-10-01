import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SCS_INDICATOR_KEYS,
  visionResultV1Schema,
  type InferenceResponseV1,
} from '@agronova/vision-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageStore } from './image-store.js';
import { InferenceClient, InferenceError } from './inference-client.js';
import { InMemoryVisionRepository } from './vision.repository.js';
import { VisionInferenceFailure, VisionService } from './vision.service.js';

const indicators = Object.fromEntries(SCS_INDICATOR_KEYS.map((k) => [k, 'YA'])) as never;
const classified = (label: 'stress' | 'not_stress', confidence: number): InferenceResponseV1 => ({
  schema_version: 1,
  inference_mode: 'mock',
  model: { base_model: 'b', adapter: 'a', adapter_revision: null },
  inference_ms: 5,
  quality: { status: 'ok', issues: [] },
  status: 'classified',
  result: { indicators, total_ya: 7, visible_count: 7, label, score_stress: 1, confidence },
  raw_response: null,
  error_message: null,
});
const meta = { camera_id: 'cam-01', captured_at: '2026-09-30T01:00:00.000Z' };

describe('VisionService', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vision-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const build = (classify: InferenceClient['classify']) => {
    const inference = { classify, health: vi.fn() } as unknown as InferenceClient;
    return new VisionService(
      new InMemoryVisionRepository(),
      new ImageStore(dir),
      inference,
      () => new Date('2026-09-30T01:00:02.000Z'),
    );
  };

  it('stores a schema-valid record with received_at set by the backend and keeps the image', async () => {
    const service = build(vi.fn().mockResolvedValue(classified('stress', 1)));
    const record = await service.processFrame(meta, Buffer.from('x'), 'image/jpeg');
    expect(visionResultV1Schema.safeParse(record).success).toBe(true);
    expect(record).toMatchObject({
      captured_at: meta.captured_at,
      received_at: '2026-09-30T01:00:02.000Z',
    });
    expect((await service.readImage(record.message_id))?.mimeType).toBe('image/jpeg');
  });

  it('raises an alert after 3 stress frames in a full window', async () => {
    const service = build(vi.fn().mockResolvedValue(classified('stress', 1)));
    let last;
    for (let i = 0; i < 5; i++)
      last = await service.processFrame(meta, Buffer.from('x'), 'image/png');
    expect(last?.vote.status).toBe('alert');
  });

  it('records inference failures explicitly (not as not_stress) and rethrows', async () => {
    const service = build(
      vi.fn().mockRejectedValue(new InferenceError('inference_timeout', 'slow')),
    );
    await expect(service.processFrame(meta, Buffer.from('x'), 'image/png')).rejects.toBeInstanceOf(
      VisionInferenceFailure,
    );
    const [saved] = await service.list('cam-01', 5);
    expect(saved).toMatchObject({ status: 'inference_error', result: null, error_message: 'slow' });
  });
});

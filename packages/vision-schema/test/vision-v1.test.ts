import { describe, expect, it } from 'vitest';

import {
  SCS_INDICATOR_KEYS,
  visionResultV1Schema,
  visionFrameMetadataSchema,
} from '../src/index.js';

const indicators = Object.fromEntries(SCS_INDICATOR_KEYS.map((k) => [k, 'TIDAK'])) as never;

const base = {
  schema_version: 1,
  message_id: '6f9619ff-8b86-4d11-b42d-00c04fc964ff',
  camera_id: 'cam-01',
  kandang_id: null,
  captured_at: '2026-09-30T01:00:00.000Z',
  received_at: '2026-09-30T01:00:01.000Z',
  inference_mode: 'mock',
  model: null,
  inference_ms: null,
  quality: null,
  status: 'inference_error',
  result: null,
  raw_response: null,
  error_message: 'timeout',
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

describe('visionResultV1Schema', () => {
  it('accepts an error record with null result (not equivalent to not_stress)', () => {
    expect(visionResultV1Schema.safeParse(base).success).toBe(true);
  });

  it('rejects a classified record without a result', () => {
    expect(visionResultV1Schema.safeParse({ ...base, status: 'classified' }).success).toBe(false);
  });

  it('rejects a non-classified record that carries a result', () => {
    const result = {
      indicators,
      total_ya: 0,
      visible_count: 7,
      label: 'not_stress',
      score_stress: 0,
      confidence: 1,
    };
    expect(visionResultV1Schema.safeParse({ ...base, result }).success).toBe(false);
  });

  it('rejects timestamps with a non-UTC offset', () => {
    expect(
      visionResultV1Schema.safeParse({ ...base, captured_at: '2026-09-30T08:00:00+07:00' }).success,
    ).toBe(false);
  });
});

describe('visionFrameMetadataSchema', () => {
  it('requires camera_id and UTC captured_at', () => {
    expect(
      visionFrameMetadataSchema.safeParse({ camera_id: 'c', captured_at: '2026-09-30T01:00:00Z' })
        .success,
    ).toBe(true);
    expect(
      visionFrameMetadataSchema.safeParse({ captured_at: '2026-09-30T01:00:00Z' }).success,
    ).toBe(false);
  });
});

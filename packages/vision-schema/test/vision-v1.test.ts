import { describe, expect, it } from 'vitest';

import {
  CAPTURED_AT_EARLIEST,
  SCS_INDICATOR_KEYS,
  inferenceResponseV1Schema,
  isCapturedInFuture,
  visionResultV1Schema,
  visionFrameMetadataSchema,
} from '../src/index.js';

const indicators = Object.fromEntries(SCS_INDICATOR_KEYS.map((k) => [k, 'TIDAK'])) as never;

const base = {
  schema_version: 1,
  message_id: '6f9619ff-8b86-4d11-b42d-00c04fc964ff',
  camera_id: 'cam-01',
  kandang_id: null,
  source: 'camera',
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

  it('allows an unknown inference_mode only on inference_error records (K5)', () => {
    expect(visionResultV1Schema.safeParse({ ...base, inference_mode: null }).success).toBe(true);
    expect(
      visionResultV1Schema.safeParse({
        ...base,
        inference_mode: null,
        status: 'skipped_quality',
        error_message: null,
      }).success,
    ).toBe(false);
  });

  it('ties ignored_manual to source manual in both directions (S2)', () => {
    const manualVote = { ...base.vote, status: 'ignored_manual' };
    expect(
      visionResultV1Schema.safeParse({ ...base, source: 'manual', vote: manualVote }).success,
    ).toBe(true);
    expect(visionResultV1Schema.safeParse({ ...base, source: 'manual' }).success).toBe(false);
    expect(visionResultV1Schema.safeParse({ ...base, vote: manualVote }).success).toBe(false);
    expect(visionResultV1Schema.safeParse({ ...base, source: 'other' }).success).toBe(false);
    const { source: _omitted, ...withoutSource } = base;
    expect(visionResultV1Schema.safeParse(withoutSource).success).toBe(false);
  });

  it('rejects timestamps with a non-UTC offset', () => {
    expect(
      visionResultV1Schema.safeParse({ ...base, captured_at: '2026-09-30T08:00:00+07:00' }).success,
    ).toBe(false);
  });

  it('accepts any hex GUID as message_id, as zod 3 did (S23)', () => {
    const parse = (message_id: string) =>
      visionResultV1Schema.safeParse({ ...base, message_id }).success;
    // No RFC 9562 version/variant bits: z.uuid() in zod 4 would reject it, z.guid() keeps it.
    expect(parse('12345678-1234-0234-c234-123456789abc')).toBe(true);
    expect(parse('12345678123412341234123456789abc')).toBe(false);
    expect(parse('not-a-uuid')).toBe(false);
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

  it('requires seconds in captured_at; zod 3 still accepted a time without them (S23)', () => {
    const parse = (captured_at: string) =>
      visionFrameMetadataSchema.safeParse({ camera_id: 'c', captured_at }).success;
    expect(parse('2026-09-30T01:00:00.123Z')).toBe(true);
    expect(parse('2026-09-30T01:00Z')).toBe(false);
  });

  it('trims ids, allows only letters, digits, ".", "_" and "-", and rejects pre-2020 times (R8)', () => {
    const parse = (fields: Record<string, string>) =>
      visionFrameMetadataSchema.safeParse({ captured_at: '2026-09-30T01:00:00Z', ...fields });
    const trimmed = parse({ camera_id: ' cam-A ', kandang_id: 'K_1.b ' });
    expect(trimmed.success && trimmed.data).toMatchObject({
      camera_id: 'cam-A',
      kandang_id: 'K_1.b',
    });
    for (const camera_id of ['   ', 'cam A', 'cam\u0000\r\n<script>', 'kamera/1', 'é'.repeat(3)]) {
      expect(parse({ camera_id }).success, camera_id).toBe(false);
    }
    expect(parse({ camera_id: 'c'.repeat(64) }).success).toBe(true);
    expect(parse({ camera_id: 'c'.repeat(65) }).success).toBe(false);
    expect(parse({ camera_id: 'c', captured_at: '1970-01-01T00:00:00Z' }).success).toBe(false);
    expect(parse({ camera_id: 'c', captured_at: CAPTURED_AT_EARLIEST }).success).toBe(true);
  });

  it('flags captured_at beyond the tolerated clock difference as future (R8)', () => {
    const now = Date.parse('2026-11-22T12:00:00Z');
    expect(isCapturedInFuture('2026-11-22T12:05:00Z', now)).toBe(false);
    expect(isCapturedInFuture('2026-11-22T12:05:01Z', now)).toBe(true);
    expect(isCapturedInFuture('2026-11-01T00:00:00Z', now)).toBe(false);
  });
});

describe('inferenceResponseV1Schema invariants (AUDIT K2)', () => {
  const answers = (ya: number, hidden = 0) =>
    Object.fromEntries(
      SCS_INDICATOR_KEYS.map((k, i) => [
        k,
        i < hidden ? 'TIDAK_TERLIHAT' : i < hidden + ya ? 'YA' : 'TIDAK',
      ]),
    ) as never;
  const result = (
    label: 'stress' | 'not_stress' | 'undefined',
    totalYa: number,
    visible: number,
    confidence: number | null,
  ) => ({
    indicators: answers(totalYa, 7 - visible),
    total_ya: totalYa,
    visible_count: visible,
    label,
    score_stress: totalYa / 7,
    confidence,
  });
  const response = {
    schema_version: 1,
    inference_mode: 'mock',
    model: { base_model: 'b', adapter: 'a', adapter_revision: null },
    inference_ms: 3,
    quality: { status: 'ok', issues: [] },
    status: 'classified',
    result: result('not_stress', 1, 7, 6 / 7),
    raw_response: null,
    error_message: null,
  };
  const ok = (value: object) => inferenceResponseV1Schema.safeParse(value).success;

  it('accepts consistent responses for every label and non-result status', () => {
    expect(ok(response)).toBe(true);
    expect(ok({ ...response, result: result('stress', 3, 7, 3 / 7) })).toBe(true);
    expect(ok({ ...response, result: result('undefined', 1, 4, null) })).toBe(true);
    expect(ok({ ...response, status: 'skipped_quality', result: null })).toBe(true);
    expect(
      ok({
        ...response,
        status: 'parse_error',
        result: null,
        raw_response: 'x',
        error_message: 'e',
      }),
    ).toBe(true);
  });

  it('accepts an optional base_revision next to adapter_revision (P7)', () => {
    const model = { base_model: 'b', adapter: 'a', adapter_revision: 'abc', base_revision: 'def' };
    expect(ok({ ...response, model })).toBe(true);
    expect(ok({ ...response, model: { ...model, base_revision: null } })).toBe(true);
    expect(ok(response)).toBe(true); // older inference without the field
  });

  it('rejects a result on a non-classified status, and a classified status without one', () => {
    expect(ok({ ...response, status: 'skipped_quality' })).toBe(false);
    expect(ok({ ...response, status: 'parse_error' })).toBe(false);
    expect(ok({ ...response, result: null })).toBe(false);
  });

  it('rejects total_ya above visible_count', () => {
    expect(
      ok({ ...response, result: { ...result('stress', 3, 7, 3 / 7), visible_count: 2 } }),
    ).toBe(false);
  });

  it('rejects confidence that does not match the undefined label', () => {
    expect(ok({ ...response, result: result('undefined', 1, 4, 0.1) })).toBe(false);
    expect(ok({ ...response, result: result('not_stress', 1, 7, null) })).toBe(false);
  });

  it('rejects a label that contradicts the SCS rule', () => {
    expect(ok({ ...response, result: result('not_stress', 3, 7, 4 / 7) })).toBe(false);
    expect(ok({ ...response, result: result('stress', 2, 7, 2 / 7) })).toBe(false);
    expect(ok({ ...response, result: result('stress', 3, 4, 3 / 7) })).toBe(false);
  });
});

describe('detection (optional detector crop, AUDIT P2)', () => {
  const response = {
    schema_version: 1,
    inference_mode: 'mock',
    model: { base_model: 'b', adapter: 'a', adapter_revision: null },
    inference_ms: 3,
    quality: { status: 'skipped', issues: ['blur'] },
    status: 'skipped_quality',
    result: null,
    raw_response: null,
    error_message: null,
  };
  const parse = (detection: unknown) =>
    inferenceResponseV1Schema.safeParse({ ...response, detection }).success;

  it('is optional, so responses without a detector still parse', () => {
    expect(inferenceResponseV1Schema.safeParse(response).success).toBe(true);
    expect(visionResultV1Schema.safeParse(base).success).toBe(true);
  });

  it('accepts a crop and a full-frame fallback with or without a box', () => {
    expect(parse({ input: 'crop', box: [10, 20, 100, 80], conf: 0.75 })).toBe(true);
    expect(parse({ input: 'full_frame', box: null, conf: null })).toBe(true);
    expect(parse({ input: 'full_frame', box: [1, 2, 20, 20], conf: 0.4 })).toBe(true);
    expect(
      visionResultV1Schema.safeParse({
        ...base,
        detection: { input: 'crop', box: [10, 20, 100, 80], conf: 0.75 },
      }).success,
    ).toBe(true);
  });

  it('rejects a crop without a box, a box without conf, and non-pixel values', () => {
    expect(parse({ input: 'crop', box: null, conf: null })).toBe(false);
    expect(parse({ input: 'full_frame', box: [1, 2, 3, 4], conf: null })).toBe(false);
    expect(parse({ input: 'crop', box: [1.5, 2, 3, 4], conf: 0.5 })).toBe(false);
    expect(parse({ input: 'crop', box: [-1, 2, 3, 4], conf: 0.5 })).toBe(false);
    expect(parse({ input: 'crop', box: [1, 2, 3], conf: 0.5 })).toBe(false);
    expect(parse({ input: 'crop', box: [1, 2, 3, 4], conf: 1.2 })).toBe(false);
    expect(parse({ input: 'crop', box: [1, 2, 3, 4], conf: 0.5, extra: 1 })).toBe(false);
  });
});

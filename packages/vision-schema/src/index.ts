import { z } from 'zod';

export const VISION_SCHEMA_VERSION = 1 as const;

// SCS rule (STRESS_THRESHOLD, MIN_VISIBLE_INDICATORS): same as the training notebook and inference
// notebook 04 (training/vlm-workflow/inference-vlm-lora-huggingface.ipynb). Voting constants: from
// the voter in inference notebook 04 only, which the voter deliberately deviates from since K1.
export const STRESS_THRESHOLD = 3 as const;
export const MIN_VISIBLE_INDICATORS = 5 as const;
export const VOTE_WINDOW_SIZE = 5 as const;
/**
 * @deprecated: tidak lagi dipakai sejak K1. The voter counts every stress/not_stress label (decision
 * 2026-11-13). Kept so the notebook value stays documented and existing imports keep compiling.
 */
export const VOTE_CONFIDENCE_THRESHOLD = 0.6 as const;
export const VOTE_MIN_VOTES_FOR_ALERT = 3 as const;

export const SCS_INDICATOR_KEYS = [
  'posisi_ekor',
  'posisi_kepala',
  'penutupan_mata',
  'pembukaan_paruh',
  'posisi_sayap',
  'postur_kaki',
  'kondisi_bulu',
] as const;

export const indicatorAnswerSchema = z.enum(['YA', 'TIDAK', 'TIDAK_TERLIHAT']);
export const stressLabelSchema = z.enum(['not_stress', 'stress', 'undefined']);
export const inferenceModeSchema = z.enum(['mock', 'real']);
/**
 * Where a frame came from (AUDIT S2, decision 2026-11-22). `camera`: an authenticated camera or
 * gateway (X-Camera-Key), or any upload while VISION_CAMERA_KEYS is unset. `manual`: a keyless upload
 * from the dashboard while camera keys are set; it is classified but never votes or raises an alert.
 */
export const frameSourceSchema = z.enum(['camera', 'manual']);

/** Non-classified statuses are never equivalent to `not_stress`; their `result` is null. */
export const visionStatusSchema = z.enum([
  'classified',
  'skipped_quality',
  'parse_error',
  'inference_error',
]);

export const qualityIssueSchema = z.enum([
  'blur',
  'terlalu_gelap',
  'terlalu_terang',
  'blank_or_occluded',
  'gagal_dibaca_atau_blank',
  /** Truncated or damaged file, detected before decoding (AUDIT R9). */
  'gambar_rusak',
]);

export const qualitySchema = z
  .object({
    status: z.enum(['ok', 'enhanced', 'skipped']),
    issues: z.array(qualityIssueSchema),
  })
  .strict();

export const indicatorsSchema = z
  .object(
    Object.fromEntries(SCS_INDICATOR_KEYS.map((key) => [key, indicatorAnswerSchema])) as Record<
      (typeof SCS_INDICATOR_KEYS)[number],
      typeof indicatorAnswerSchema
    >,
  )
  .strict();

export const classificationResultSchema = z
  .object({
    indicators: indicatorsSchema,
    total_ya: z.number().int().min(0).max(7),
    visible_count: z.number().int().min(0).max(7),
    label: stressLabelSchema,
    score_stress: z.number().min(0).max(1),
    /**
     * Severity, not model certainty: YA/7 for `stress`, 1 - YA/7 for `not_stress`. Null when label
     * is `undefined` (the notebook uses 0.0; null avoids implying certainty). Not used for voting
     * since K1; kept in the contract for compatibility.
     */
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

/** A pixel coordinate or size of the uploaded frame. */
const pixel = z.number().int().nonnegative();

export const modelInfoSchema = z
  .object({
    base_model: z.string().min(1),
    adapter: z.string().min(1),
    /** Commit of the adapter files actually loaded (P7); null for mock or a local folder. */
    adapter_revision: z.string().nullable(),
    /** Commit of the base model actually loaded (P7). Optional: older inference builds omit it. */
    base_revision: z.string().nullable().optional(),
  })
  .strict();

/**
 * What the optional detector did before the VLM (AUDIT P2, INFERENCE_DETECTOR=crop; off by default).
 * Present only while the detector is on. `box` and `conf` describe the largest detection, in pixels of
 * the uploaded frame; `input` says whether the VLM saw that crop or the full frame (nothing found, or a
 * box too small to crop).
 */
export const detectionSchema = z
  .object({
    input: z.enum(['crop', 'full_frame']),
    box: z.tuple([pixel, pixel, pixel, pixel]).nullable(),
    conf: z.number().min(0).max(1).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.box === null) !== (value.conf === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['conf'],
        message: 'box and conf come together',
      });
    }
    if (value.input === 'crop' && value.box === null) {
      ctx.addIssue({ code: 'custom', path: ['box'], message: 'a crop needs its box' });
    }
  });

/** Response of the Python inference service: POST /v1/classify. */
export const inferenceResponseV1Schema = z
  .object({
    schema_version: z.literal(VISION_SCHEMA_VERSION),
    inference_mode: inferenceModeSchema,
    model: modelInfoSchema,
    inference_ms: z.number().nonnegative(),
    quality: qualitySchema,
    status: z.enum(['classified', 'skipped_quality', 'parse_error']),
    result: classificationResultSchema.nullable(),
    raw_response: z.string().nullable(),
    error_message: z.string().nullable(),
    detection: detectionSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Cross-field invariants (AUDIT K2): a response that breaks them is rejected as a whole, so a
    // contradictory result can never reach the voter or the stored history.
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const { result } = value;
    if ((value.status === 'classified') !== (result !== null)) {
      fail(['result'], 'result must be present if and only if status is "classified"');
    }
    if (result === null) return;
    if (result.total_ya > result.visible_count) {
      fail(['result', 'total_ya'], 'total_ya must not exceed visible_count');
    }
    if ((result.confidence === null) !== (result.label === 'undefined')) {
      fail(['result', 'confidence'], 'confidence must be null if and only if label is "undefined"');
    }
    const expected =
      result.visible_count < MIN_VISIBLE_INDICATORS
        ? 'undefined'
        : result.total_ya >= STRESS_THRESHOLD
          ? 'stress'
          : 'not_stress';
    if (result.label !== expected) {
      fail(['result', 'label'], `label must be "${expected}" under the SCS rule`);
    }
  });

export const voteStatusSchema = z.enum([
  'ignored_no_result',
  'ignored_undefined',
  /** @deprecated: tidak lagi dihasilkan sejak K1. Kept so older records and clients still parse. */
  'ignored_low_confidence',
  /** A manual test upload: classified for the user, but kept out of the window and alerts (S2). */
  'ignored_manual',
  'waiting_window',
  'no_alert',
  'alert',
]);

export const voteSchema = z
  .object({
    status: voteStatusSchema,
    trigger_alert: z.boolean(),
    window_size: z.literal(VOTE_WINDOW_SIZE),
    window_filled: z.number().int().min(0).max(VOTE_WINDOW_SIZE),
    majority_label: z.enum(['not_stress', 'stress']).nullable(),
    majority_count: z.number().int().min(1).max(VOTE_WINDOW_SIZE).nullable(),
  })
  .strict();

/**
 * UTC ISO 8601 with a `Z` suffix and seconds (`2026-01-01T00:00:00Z`, fractions allowed); an offset or
 * a time without seconds is rejected (zod 4; zod 3 still accepted `T00:00Z`, AUDIT S23).
 */
const utcTimestamp = z.iso.datetime({ offset: false });

/**
 * Any 8-4-4-4-12 hex id, as zod 3 accepted (AUDIT S23). `z.uuid()` in zod 4 also checks the RFC 9562
 * version and variant bits; this does not, so ids from older clients and devices keep working.
 */
const messageId = z.guid();

/** Stored/served record: one processed frame. */
export const visionResultV1Schema = z
  .object({
    schema_version: z.literal(VISION_SCHEMA_VERSION),
    message_id: messageId,
    camera_id: z.string().min(1).max(64),
    kandang_id: z.string().min(1).max(64).nullable(),
    source: frameSourceSchema,
    captured_at: utcTimestamp,
    received_at: utcTimestamp,
    /** Null only for `inference_error`: the API cannot tell which backend failed (AUDIT K5). */
    inference_mode: inferenceModeSchema.nullable(),
    model: modelInfoSchema.nullable(),
    inference_ms: z.number().nonnegative().nullable(),
    quality: qualitySchema.nullable(),
    status: visionStatusSchema,
    result: classificationResultSchema.nullable(),
    raw_response: z.string().nullable(),
    error_message: z.string().nullable(),
    vote: voteSchema,
    image_available: z.boolean(),
    /** Copied from the inference response; absent while the detector is off (P2). */
    detection: detectionSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.status === 'classified') !== (value.result !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'result must be present if and only if status is "classified"',
      });
    }
    if ((value.source === 'manual') !== (value.vote.status === 'ignored_manual')) {
      ctx.addIssue({
        code: 'custom',
        path: ['vote', 'status'],
        message: 'vote.status must be "ignored_manual" if and only if source is "manual"',
      });
    }
    if (value.inference_mode === null && value.status !== 'inference_error') {
      ctx.addIssue({
        code: 'custom',
        path: ['inference_mode'],
        message: 'inference_mode may be null only when status is "inference_error"',
      });
    }
  });

/**
 * Error codes the API returns as `{ error }` from the vision endpoints. Single source for the API
 * (inference-client, controller) and the web messages (AUDIT H16).
 */
export const VISION_API_ERROR_CODES = [
  'inference_unreachable',
  'inference_timeout',
  'inference_not_ready',
  /** The model failed to load (inference /health `error`); retrying soon will not help (H11). */
  'inference_unavailable',
  /** Inference queue is full (503 queue_full); retry after Retry-After, nothing was stored (R1). */
  'inference_busy',
  'inference_bad_response',
  'inference_failed',
  /** The GPU ran out of memory on this frame; inference stays up and may succeed later (R12). */
  'inference_gpu_oom',
  'invalid_metadata',
  'image_required',
  'image_empty',
  'image_too_large',
  'unsupported_image_type',
  /** The API could not write the frame to VISION_IMAGE_DIR (disk full, read-only); 503 (H9). */
  'storage_unavailable',
  /** Too many uploads (per IP for manual uploads, per camera interval); 429 + Retry-After (S2). */
  'upload_rate_limited',
  /** X-Camera-Key was sent but is not a configured camera key; 401 (S2). */
  'invalid_camera_key',
  /** The camera key belongs to another camera_id than the one in the metadata; 403 (S2). */
  'camera_id_mismatch',
] as const;
export type VisionApiErrorCode = (typeof VISION_API_ERROR_CODES)[number];
/** The subset raised when the API talks to the inference service. */
export type InferenceErrorCode = Extract<VisionApiErrorCode, `inference_${string}`>;

/**
 * Characters allowed in camera_id and kandang_id (AUDIT R8). Surrounding spaces are trimmed first, so
 * `"cam-A "` and `"cam-A"` are the same camera and share one voting window.
 */
export const FRAME_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
export const FRAME_ID_MAX_LENGTH = 64;
/**
 * captured_at may not be earlier than this. A camera without a set clock sends 1970; a manual upload
 * may still carry an old photo's file date, so there is no maximum age (AUDIT R8).
 */
export const CAPTURED_AT_EARLIEST = '2020-01-01T00:00:00Z';
/** Clock difference tolerated between a camera and the API before captured_at counts as future. */
export const CAPTURED_AT_MAX_FUTURE_MS = 5 * 60_000;

const frameId = z
  .string()
  .trim()
  .min(1)
  .max(FRAME_ID_MAX_LENGTH)
  .regex(FRAME_ID_PATTERN, 'use only letters, digits, ".", "_" and "-"');

export const visionFrameMetadataSchema = z
  .object({
    camera_id: frameId,
    kandang_id: frameId.optional(),
    captured_at: utcTimestamp.refine(
      (value) => Date.parse(value) >= Date.parse(CAPTURED_AT_EARLIEST),
      `must not be earlier than ${CAPTURED_AT_EARLIEST}`,
    ),
  })
  .strict();

/**
 * True when captured_at lies further in the future than the tolerated clock difference. Kept out of
 * the schema because it depends on the time the API received the frame.
 */
export function isCapturedInFuture(capturedAt: string, receivedAtMs: number): boolean {
  return Date.parse(capturedAt) > receivedAtMs + CAPTURED_AT_MAX_FUTURE_MS;
}

export type IndicatorAnswer = z.infer<typeof indicatorAnswerSchema>;
export type StressLabel = z.infer<typeof stressLabelSchema>;
export type VisionStatus = z.infer<typeof visionStatusSchema>;
export type VoteStatus = z.infer<typeof voteStatusSchema>;
export type FrameSource = z.infer<typeof frameSourceSchema>;
export type Vote = z.infer<typeof voteSchema>;
export type Quality = z.infer<typeof qualitySchema>;
export type ClassificationResult = z.infer<typeof classificationResultSchema>;
export type InferenceResponseV1 = z.infer<typeof inferenceResponseV1Schema>;
export type Detection = z.infer<typeof detectionSchema>;
export type VisionResultV1 = z.infer<typeof visionResultV1Schema>;
export type VisionFrameMetadata = z.infer<typeof visionFrameMetadataSchema>;

export { evaluateVote, type VotedLabel, type VoteInput } from './voter.js';

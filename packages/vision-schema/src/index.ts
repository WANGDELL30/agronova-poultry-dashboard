import { z } from 'zod';

export const VISION_SCHEMA_VERSION = 1 as const;

// Rules ported unchanged from the inference notebook (04-inference-vlm-lora-huggingface).
export const STRESS_THRESHOLD = 3 as const;
export const MIN_VISIBLE_INDICATORS = 5 as const;
export const VOTE_WINDOW_SIZE = 5 as const;
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
    /** Null when label is `undefined` (the notebook uses 0.0; null avoids implying certainty). */
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const modelInfoSchema = z
  .object({
    base_model: z.string().min(1),
    adapter: z.string().min(1),
    adapter_revision: z.string().nullable(),
  })
  .strict();

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
  })
  .strict();

export const voteStatusSchema = z.enum([
  'ignored_no_result',
  'ignored_undefined',
  'ignored_low_confidence',
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

const utcTimestamp = z.string().datetime({ offset: false });

/** Stored/served record: one processed frame. */
export const visionResultV1Schema = z
  .object({
    schema_version: z.literal(VISION_SCHEMA_VERSION),
    message_id: z.string().uuid(),
    camera_id: z.string().min(1).max(64),
    kandang_id: z.string().min(1).max(64).nullable(),
    captured_at: utcTimestamp,
    received_at: utcTimestamp,
    inference_mode: inferenceModeSchema,
    model: modelInfoSchema.nullable(),
    inference_ms: z.number().nonnegative().nullable(),
    quality: qualitySchema.nullable(),
    status: visionStatusSchema,
    result: classificationResultSchema.nullable(),
    raw_response: z.string().nullable(),
    error_message: z.string().nullable(),
    vote: voteSchema,
    image_available: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.status === 'classified') !== (value.result !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result'],
        message: 'result must be present if and only if status is "classified"',
      });
    }
  });

export const visionFrameMetadataSchema = z
  .object({
    camera_id: z.string().min(1).max(64),
    kandang_id: z.string().min(1).max(64).optional(),
    captured_at: utcTimestamp,
  })
  .strict();

export type IndicatorAnswer = z.infer<typeof indicatorAnswerSchema>;
export type StressLabel = z.infer<typeof stressLabelSchema>;
export type VisionStatus = z.infer<typeof visionStatusSchema>;
export type VoteStatus = z.infer<typeof voteStatusSchema>;
export type Vote = z.infer<typeof voteSchema>;
export type Quality = z.infer<typeof qualitySchema>;
export type ClassificationResult = z.infer<typeof classificationResultSchema>;
export type InferenceResponseV1 = z.infer<typeof inferenceResponseV1Schema>;
export type VisionResultV1 = z.infer<typeof visionResultV1Schema>;
export type VisionFrameMetadata = z.infer<typeof visionFrameMetadataSchema>;

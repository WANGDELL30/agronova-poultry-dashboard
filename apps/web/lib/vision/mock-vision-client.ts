import {
  SCS_INDICATOR_KEYS,
  VISION_SCHEMA_VERSION,
  type ClassificationResult,
  type IndicatorAnswer,
  type VisionResultV1,
} from '@agronova/vision-schema';

import type { SubmitFrameInput, VisionClient } from './vision-client';

const MODEL = { base_model: 'mock', adapter: 'mock', adapter_revision: null };

function classification(
  ya: number,
  hidden: number,
  label: ClassificationResult['label'],
  confidence: number | null,
): ClassificationResult {
  const answers: IndicatorAnswer[] = SCS_INDICATOR_KEYS.map((_, index) =>
    index < ya ? 'YA' : index >= SCS_INDICATOR_KEYS.length - hidden ? 'TIDAK_TERLIHAT' : 'TIDAK',
  );
  return {
    indicators: Object.fromEntries(
      SCS_INDICATOR_KEYS.map((key, index) => [key, answers[index]]),
    ) as ClassificationResult['indicators'],
    total_ya: ya,
    visible_count: SCS_INDICATOR_KEYS.length - hidden,
    label,
    score_stress: confidence === null ? 0 : label === 'stress' ? confidence : 1 - confidence,
    confidence,
  };
}

/** Canned scenarios, cycled by upload order. Covers every non-happy status on purpose. */
const scenarios: Array<
  Pick<VisionResultV1, 'status' | 'result' | 'quality' | 'raw_response' | 'error_message'>
> = [
  {
    status: 'classified',
    result: classification(0, 0, 'not_stress', 1),
    quality: { status: 'ok', issues: [] },
    raw_response: null,
    error_message: null,
  },
  {
    status: 'classified',
    result: classification(5, 0, 'stress', 0.71),
    quality: { status: 'enhanced', issues: ['terlalu_gelap'] },
    raw_response: null,
    error_message: null,
  },
  {
    status: 'classified',
    result: classification(1, 3, 'undefined', null),
    quality: { status: 'ok', issues: [] },
    raw_response: null,
    error_message: null,
  },
  {
    status: 'skipped_quality',
    result: null,
    quality: { status: 'skipped', issues: ['blur', 'blank_or_occluded'] },
    raw_response: null,
    error_message: null,
  },
  {
    status: 'parse_error',
    result: null,
    quality: { status: 'ok', issues: [] },
    raw_response: '{"indicators": ',
    error_message: 'Unterminated JSON',
  },
];

/** Browser-only stand-in for the API (no network, no persistence). The vote is not simulated. */
export class MockVisionClient implements VisionClient {
  readonly mode = 'mock' as const;
  private readonly records: VisionResultV1[] = [];
  private readonly urls = new Map<string, string>();

  async submit({
    file,
    cameraId,
    kandangId,
    capturedAt,
  }: SubmitFrameInput): Promise<VisionResultV1> {
    const scenario = scenarios[this.records.length % scenarios.length]!;
    const messageId = crypto.randomUUID();
    const record: VisionResultV1 = {
      schema_version: VISION_SCHEMA_VERSION,
      message_id: messageId,
      camera_id: cameraId,
      kandang_id: kandangId ?? null,
      captured_at: capturedAt,
      received_at: new Date().toISOString(),
      inference_mode: 'mock',
      model: MODEL,
      inference_ms: 0,
      ...scenario,
      vote: {
        status: 'waiting_window',
        trigger_alert: false,
        window_size: 5,
        window_filled: 0,
        majority_label: null,
        majority_count: null,
      },
      image_available: true,
    };
    this.urls.set(messageId, URL.createObjectURL(file));
    this.records.unshift(record);
    return record;
  }

  async list(): Promise<VisionResultV1[]> {
    return [...this.records];
  }

  imageUrl(record: VisionResultV1): string | null {
    return this.urls.get(record.message_id) ?? null;
  }
}

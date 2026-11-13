import {
  SCS_INDICATOR_KEYS,
  VISION_SCHEMA_VERSION,
  VOTE_WINDOW_SIZE,
  evaluateVote,
  type ClassificationResult,
  type IndicatorAnswer,
  type VisionResultV1,
  type VotedLabel,
} from '@agronova/vision-schema';

import type { SubmitFrameInput, VisionClient } from './vision-client';

const MODEL = { base_model: 'mock', adapter: 'mock', adapter_revision: null };

/** Same formulas as `apps/inference/app/scs.py` and `pipeline.py`: score = YA/7 (AUDIT K6). */
function classification(
  ya: number,
  hidden: number,
  label: ClassificationResult['label'],
): ClassificationResult {
  const score = ya / SCS_INDICATOR_KEYS.length;
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
    score_stress: score,
    confidence: label === 'stress' ? score : label === 'not_stress' ? 1 - score : null,
  };
}

/** Canned scenarios, cycled by upload order. Covers every non-happy status on purpose. */
const scenarios: Array<
  Pick<VisionResultV1, 'status' | 'result' | 'quality' | 'raw_response' | 'error_message'>
> = [
  {
    status: 'classified',
    result: classification(0, 0, 'not_stress'),
    quality: { status: 'ok', issues: [] },
    raw_response: null,
    error_message: null,
  },
  {
    status: 'classified',
    result: classification(5, 0, 'stress'),
    quality: { status: 'enhanced', issues: ['terlalu_gelap'] },
    raw_response: null,
    error_message: null,
  },
  {
    status: 'classified',
    result: classification(1, 3, 'undefined'),
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

/** Browser-only stand-in for the API (no network, no persistence). Votes with the API's voter. */
export class MockVisionClient implements VisionClient {
  readonly mode = 'mock' as const;
  private readonly records: VisionResultV1[] = [];
  /** Voted labels per camera, oldest first (uploads arrive in order here). */
  private readonly windows = new Map<string, VotedLabel[]>();
  private readonly urls = new Map<string, string>();

  async submit({
    file,
    cameraId,
    kandangId,
    capturedAt,
  }: SubmitFrameInput): Promise<VisionResultV1> {
    const scenario = scenarios[this.records.length % scenarios.length]!;
    const messageId = crypto.randomUUID();
    const window = this.windows.get(cameraId) ?? [];
    const { vote, accepted } = evaluateVote({ result: scenario.result, window });
    if (accepted && scenario.result && scenario.result.label !== 'undefined') {
      this.windows.set(cameraId, [...window, scenario.result.label].slice(-VOTE_WINDOW_SIZE));
    }
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
      vote,
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

import { randomUUID } from 'node:crypto';

import {
  VISION_SCHEMA_VERSION,
  type InferenceResponseV1,
  type VisionFrameMetadata,
  type VisionResultV1,
} from '@agronova/vision-schema';

import { ImageStore } from './image-store.js';
import { InferenceClient, InferenceError } from './inference-client.js';
import type { VisionRepository } from './vision.repository.js';
import { evaluateVote } from './voter.js';

export class VisionInferenceFailure extends Error {
  constructor(
    readonly code: InferenceError['code'],
    message: string,
    /** Null when nothing was stored (model not ready). */
    readonly record: VisionResultV1 | null,
  ) {
    super(message);
  }
}

export class VisionService {
  constructor(
    private readonly repository: VisionRepository,
    private readonly images: ImageStore,
    private readonly inference: InferenceClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processFrame(
    meta: VisionFrameMetadata,
    image: Buffer,
    mimeType: string,
  ): Promise<VisionResultV1> {
    const messageId = randomUUID();
    const receivedAt = this.now().toISOString();
    let response: InferenceResponseV1 | null = null;
    let failure: InferenceError | null = null;
    try {
      response = await this.inference.classify(image, mimeType);
    } catch (error) {
      if (!(error instanceof InferenceError)) throw error;
      failure = error;
    }
    if (failure?.code === 'inference_not_ready') {
      // Nothing was analysed: store neither the frame nor a record, so a retry does not leave a
      // duplicate inference_error entry in the history (AUDIT R10).
      throw new VisionInferenceFailure(failure.code, failure.message, null);
    }
    await this.images.save(messageId, mimeType, image);

    // Only a classified frame carries a usable result; never vote on any other status (K2, B5).
    const result = response?.status === 'classified' ? response.result : null;
    const window = await this.repository.acceptedLabels(meta.camera_id, 4, {
      received_at: receivedAt,
      message_id: messageId,
    });
    const { vote } = evaluateVote({ result, window });

    const record: VisionResultV1 = {
      schema_version: VISION_SCHEMA_VERSION,
      message_id: messageId,
      camera_id: meta.camera_id,
      kandang_id: meta.kandang_id ?? null,
      captured_at: meta.captured_at,
      received_at: receivedAt,
      inference_mode: response?.inference_mode ?? 'real',
      model: response?.model ?? null,
      inference_ms: response?.inference_ms ?? null,
      quality: response?.quality ?? null,
      status: response?.status ?? 'inference_error',
      result,
      raw_response: response?.raw_response ?? null,
      error_message: response?.error_message ?? failure?.message ?? null,
      vote,
      image_available: true,
    };
    await this.repository.insert(record);

    if (failure) throw new VisionInferenceFailure(failure.code, failure.message, record);
    return record;
  }

  list(cameraId: string | undefined, limit: number): Promise<VisionResultV1[]> {
    return this.repository.list(cameraId, limit);
  }

  findById(messageId: string): Promise<VisionResultV1 | null> {
    return this.repository.findById(messageId);
  }

  readImage(messageId: string) {
    return this.images.read(messageId);
  }

  health() {
    return this.inference.health();
  }
}

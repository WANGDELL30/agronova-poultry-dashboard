import {
  inferenceResponseV1Schema,
  type InferenceErrorCode,
  type InferenceResponseV1,
} from '@agronova/vision-schema';

/** Codes the client raises: inference_* plus image_too_large when inference rejects the pixel count (R2). */
export type InferenceClientErrorCode = InferenceErrorCode | 'image_too_large';

export class InferenceError extends Error {
  constructor(
    readonly code: InferenceClientErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface InferenceHealth {
  status: 'ready' | 'loading' | 'error' | 'unreachable';
  inference_mode: 'mock' | 'real' | null;
  detail: string | null;
}

export class InferenceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly apiKey: string | null = null,
    /** Health checks use their own short timeout instead of the upload one (AUDIT R13). */
    private readonly healthTimeoutMs = 5_000,
  ) {}

  async classify(image: Buffer, mimeType: string): Promise<InferenceResponseV1> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(image)], { type: mimeType }), 'frame');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/classify`, {
        method: 'POST',
        body: form,
        headers: this.apiKey ? { 'X-API-Key': this.apiKey } : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new InferenceError(
          'inference_timeout',
          `Inference did not answer within ${this.timeoutMs} ms.`,
        );
      }
      throw new InferenceError('inference_unreachable', 'Inference service is unreachable.');
    }
    if (response.status === 401) {
      throw new InferenceError('inference_bad_response', 'Inference rejected the API key.');
    }
    if (response.status === 413) {
      // Inference rejects images above its pixel limit from the header, before decoding (R2).
      throw new InferenceError('image_too_large', 'Image exceeds the inference pixel limit.');
    }
    if (response.status === 503) {
      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
        status?: unknown;
      } | null;
      if (body?.error === 'gpu_oom') {
        throw new InferenceError('inference_gpu_oom', 'Inference ran out of GPU memory.');
      }
      if (body?.error === 'queue_full') {
        throw new InferenceError('inference_busy', 'Inference queue is full.');
      }
      if (body?.status === 'error') {
        // The model failed to load: unlike `loading`, waiting a few seconds will not help (H11).
        throw new InferenceError('inference_unavailable', 'Inference model failed to load.');
      }
      throw new InferenceError('inference_not_ready', 'Inference model is not ready.');
    }
    if (response.status >= 500) {
      // Includes {"error": "backend_error"} (R12): the service failed, the answer is not malformed.
      throw new InferenceError(
        'inference_failed',
        `Inference failed with HTTP ${response.status}.`,
      );
    }
    if (!response.ok) {
      throw new InferenceError(
        'inference_bad_response',
        `Inference returned HTTP ${response.status}.`,
      );
    }
    const parsed = inferenceResponseV1Schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new InferenceError(
        'inference_bad_response',
        'Inference response violates the v1 contract.',
      );
    }
    return parsed.data;
  }

  async health(): Promise<InferenceHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(this.healthTimeoutMs),
      });
      const body = (await response.json().catch(() => ({}))) as {
        status?: string;
        inference_mode?: 'mock' | 'real';
        detail?: string;
      };
      const status =
        response.ok && body.status === 'ready'
          ? 'ready'
          : body.status === 'error'
            ? 'error'
            : 'loading';
      return { status, inference_mode: body.inference_mode ?? null, detail: body.detail ?? null };
    } catch {
      return { status: 'unreachable', inference_mode: null, detail: null };
    }
  }
}

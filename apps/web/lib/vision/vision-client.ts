import type { VisionResultV1 } from '@agronova/vision-schema';

export interface SubmitFrameInput {
  file: File;
  cameraId: string;
  kandangId?: string;
  /** UTC ISO timestamp of capture on the device. */
  capturedAt: string;
}

export interface VisionClient {
  readonly mode: 'mock' | 'api';
  submit(input: SubmitFrameInput): Promise<VisionResultV1>;
  list(): Promise<VisionResultV1[]>;
  imageUrl(record: VisionResultV1): string | null;
}

/** `code` is the API error code (e.g. inference_timeout) or a client-side code. */
export class VisionClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly messageId?: string,
  ) {
    super(message);
    this.name = 'VisionClientError';
  }
}

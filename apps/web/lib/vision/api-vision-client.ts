import { visionResultV1Schema, type VisionResultV1 } from '@agronova/vision-schema';

import { VisionClientError, type SubmitFrameInput, type VisionClient } from './vision-client';

interface ApiErrorBody {
  error?: string;
  message?: string | string[];
  message_id?: string;
}

export class ApiVisionClient implements VisionClient {
  readonly mode = 'api' as const;
  private readonly base: string;

  constructor(apiBaseUrl: string) {
    this.base = `${apiBaseUrl.replace(/\/+$/, '')}/api/v1/vision`;
  }

  async submit({
    file,
    cameraId,
    kandangId,
    capturedAt,
  }: SubmitFrameInput): Promise<VisionResultV1> {
    const form = new FormData();
    form.append('camera_id', cameraId);
    if (kandangId) form.append('kandang_id', kandangId);
    form.append('captured_at', capturedAt);
    form.append('image', file);
    const response = await this.request(`${this.base}/frames`, { method: 'POST', body: form });
    return visionResultV1Schema.parse(await response.json());
  }

  async list(): Promise<VisionResultV1[]> {
    const response = await this.request(`${this.base}/results?limit=20`);
    return visionResultV1Schema.array().parse(await response.json());
  }

  imageUrl(record: VisionResultV1): string | null {
    return record.image_available ? `${this.base}/results/${record.message_id}/image` : null;
  }

  private async request(url: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new VisionClientError('network', 'API is unreachable.');
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
      throw new VisionClientError(
        body.error ?? `http_${response.status}`,
        message ?? `HTTP ${response.status}`,
        body.message_id,
      );
    }
    return response;
  }
}

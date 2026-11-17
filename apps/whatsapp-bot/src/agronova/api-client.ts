import { telemetryReceiptV1Schema, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import { visionResultV1Schema, type VisionResultV1 } from '@agronova/vision-schema';
import { z } from 'zod';

/** The API could not be reached, timed out, or answered with something outside the contract. */
export class AgronovaApiError extends Error {}

const visionResultsSchema = z.array(visionResultV1Schema);

/**
 * Read-only client for the existing AgroNova API. It only issues GET requests: the bot never
 * ingests telemetry, uploads frames, or talks to the inference service.
 */
export class AgronovaApiClient {
  private readonly root: string;

  constructor(
    baseUrl: string,
    private readonly timeoutMs: number,
    // Wrapped so `fetch` is never called detached from globalThis.
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.root = `${baseUrl.replace(/\/+$/, '')}/api/v1`;
  }

  /** Null while the API holds no reading (HTTP 204). */
  async latestTelemetry(deviceId?: string | null): Promise<TelemetryReceiptV1 | null> {
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    const response = await this.get(`/telemetry/latest${query}`);
    if (response.status === 204) return null;
    return this.parse(response, telemetryReceiptV1Schema, 'telemetry/latest');
  }

  /** Newest first, as served by the API. */
  async visionResults(limit = 50): Promise<VisionResultV1[]> {
    const response = await this.get(`/vision/results?limit=${limit}`);
    return this.parse(response, visionResultsSchema, 'vision/results');
  }

  private async get(path: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.root}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AgronovaApiError(`AgroNova API request failed (${path}): ${reason}`);
    }
    if (!response.ok) {
      throw new AgronovaApiError(`AgroNova API answered ${response.status} for ${path}.`);
    }
    return response;
  }

  private async parse<T>(response: Response, schema: z.ZodType<T>, name: string): Promise<T> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AgronovaApiError(`AgroNova API returned invalid JSON for ${name}.`);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AgronovaApiError(`AgroNova API response for ${name} does not match the schema.`);
    }
    return parsed.data;
  }
}

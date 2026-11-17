import type { MetaConfig } from '../config.js';

import { MAX_TEXT_LENGTH, WhatsAppSendError, type WhatsAppProvider } from './provider.js';

/** Sends through the WhatsApp Cloud API (Graph API `/{phone-number-id}/messages`). */
export class MetaProvider implements WhatsAppProvider {
  private readonly url: string;

  constructor(
    private readonly config: MetaConfig,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
  }

  async sendText(to: string, body: string): Promise<void> {
    const text = body.length > MAX_TEXT_LENGTH ? `${body.slice(0, MAX_TEXT_LENGTH - 1)}…` : body;
    await this.post({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    });
  }

  async sendTemplate(
    to: string,
    template: string,
    languageCode: string,
    bodyParameters: readonly string[],
  ): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: bodyParameters.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    });
  }

  private async post(payload: unknown): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new WhatsAppSendError(`WhatsApp Cloud API request failed: ${reason}`);
    }
    if (response.ok) return;
    // Meta's error body names the cause (expired token, unapproved template, closed 24-hour
    // window). It does not echo the access token.
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string; code?: number } };
      if (body.error?.message) detail = ` (code ${body.error.code ?? '?'}: ${body.error.message})`;
    } catch {
      // Body was not JSON; the status code alone is reported.
    }
    throw new WhatsAppSendError(`WhatsApp Cloud API answered ${response.status}${detail}`);
  }
}

import { maskNumber, type WhatsAppProvider } from './provider.js';

/** Local stand-in for WhatsApp: prints what would be sent and contacts nobody. */
export class ConsoleProvider implements WhatsAppProvider {
  constructor(private readonly write: (line: string) => void = (line) => console.log(line)) {}

  async sendText(to: string, body: string): Promise<void> {
    this.write(`[whatsapp:console] text -> ${maskNumber(to)}\n${body}`);
  }

  async sendTemplate(
    to: string,
    template: string,
    languageCode: string,
    bodyParameters: readonly string[],
  ): Promise<void> {
    this.write(
      `[whatsapp:console] template "${template}" (${languageCode}) -> ${maskNumber(to)}\n${bodyParameters.join(' | ')}`,
    );
  }
}

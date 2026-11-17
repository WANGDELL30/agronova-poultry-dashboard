export interface WhatsAppProvider {
  /** Free-form text. WhatsApp only delivers it within 24 hours of the recipient's last message. */
  sendText(to: string, body: string): Promise<void>;
  /** Pre-approved template; the only way to reach a recipient outside the 24-hour window. */
  sendTemplate(
    to: string,
    template: string,
    languageCode: string,
    bodyParameters: readonly string[],
  ): Promise<void>;
}

export class WhatsAppSendError extends Error {}

/** WhatsApp rejects text bodies above 4096 characters. */
export const MAX_TEXT_LENGTH = 4096;

/** Show only the last four digits of a phone number in logs. */
export function maskNumber(number: string): string {
  return number.length <= 4 ? '****' : `${'*'.repeat(number.length - 4)}${number.slice(-4)}`;
}

/**
 * Remembers when each number last wrote to the bot. WhatsApp allows free-form replies for 24
 * hours after that; later messages need a template. In memory: after a restart every recipient is
 * treated as outside the window.
 */
export class SessionWindow {
  static readonly WINDOW_MS = 24 * 60 * 60 * 1000;
  private readonly lastInbound = new Map<string, number>();

  recordInbound(number: string, at: Date): void {
    this.lastInbound.set(number, at.getTime());
  }

  isOpen(number: string, now: Date): boolean {
    const last = this.lastInbound.get(number);
    return last !== undefined && now.getTime() - last < SessionWindow.WINDOW_MS;
  }
}

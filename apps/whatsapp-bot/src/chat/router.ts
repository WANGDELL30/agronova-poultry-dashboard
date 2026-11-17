import { describeSnapshot, type KandangSnapshot } from '../agronova/snapshot.js';
import { normalizeNumber } from '../config.js';
import { maskNumber, type SessionWindow, type WhatsAppProvider } from '../whatsapp/provider.js';
import type { InboundMessage } from '../whatsapp/webhook-schema.js';

import type { Assistant, ChatTurn } from './assistant.js';
import { controlUnavailableReply, detectControlIntent } from './control.js';

/** Meta redelivers messages it could not hand over (for example while the bot was down). */
export const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;
const REMEMBERED_MESSAGE_IDS = 2000;
const HISTORY_TURNS = 6;
const HOUR_MS = 60 * 60 * 1000;

export const TEXT_ONLY_REPLY =
  'Saat ini saya hanya bisa membaca pesan teks. Silakan tulis pertanyaan Anda tentang kondisi kandang.';
export const RATE_LIMIT_REPLY =
  'Terlalu banyak pesan dalam satu jam terakhir. Silakan coba lagi beberapa saat lagi.';

export interface RouterOptions {
  allowedNumbers: ReadonlySet<string>;
  provider: WhatsAppProvider;
  sessions: SessionWindow;
  fetchSnapshot: () => Promise<KandangSnapshot>;
  /** Null when no API key is configured: every question gets the plain status summary. */
  assistant: Assistant | null;
  timeZone: string;
  rateLimitPerHour: number;
  now?: () => Date;
  log?: (message: string) => void;
}

export class MessageRouter {
  private readonly seen = new Set<string>();
  private readonly history = new Map<string, ChatTurn[]>();
  private readonly recent = new Map<string, number[]>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly now: () => Date;
  private readonly log: (message: string) => void;

  constructor(private readonly options: RouterOptions) {
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? ((message) => console.warn(message));
  }

  /**
   * Never rejects: the webhook has already answered Meta, so a failure here is logged. Messages
   * from one number are handled one at a time, in arrival order.
   */
  handle(message: InboundMessage): Promise<void> {
    const from = normalizeNumber(message.from);
    const previous = this.queues.get(from) ?? Promise.resolve();
    const next = previous
      .then(() => this.process(from, message))
      .catch((error: unknown) => {
        this.log(
          `[router] message from ${maskNumber(from)} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        if (this.queues.get(from) === next) this.queues.delete(from);
      });
    this.queues.set(from, next);
    return next;
  }

  private async process(from: string, message: InboundMessage): Promise<void> {
    if (this.seen.has(message.id)) return;
    this.seen.add(message.id);
    if (this.seen.size > REMEMBERED_MESSAGE_IDS) {
      this.seen.delete(this.seen.values().next().value as string);
    }

    // House data goes only to numbers on the allowlist. Others get no reply at all, so the bot
    // does not confirm to strangers that it exists or spend anything on them.
    if (!this.options.allowedNumbers.has(from)) {
      this.log(`[router] ignored a message from ${maskNumber(from)}: not in WA_ALLOWED_NUMBERS.`);
      return;
    }

    const now = this.now();
    this.options.sessions.recordInbound(from, message.sentAt);
    if (now.getTime() - message.sentAt.getTime() > MAX_MESSAGE_AGE_MS) {
      // Answering now would present current data as a reply to an old question.
      this.log(`[router] skipped an old redelivered message from ${maskNumber(from)}.`);
      return;
    }

    if (message.text === null || message.text.trim() === '') {
      await this.options.provider.sendText(from, TEXT_ONLY_REPLY);
      return;
    }
    const text = message.text.trim();

    if (!this.withinRateLimit(from, now)) {
      await this.options.provider.sendText(from, RATE_LIMIT_REPLY);
      return;
    }

    // Decided by fixed rules before the LLM is involved; see control.ts.
    const control = detectControlIntent(text);
    if (control) {
      await this.options.provider.sendText(from, controlUnavailableReply(control));
      return;
    }

    const snapshot = await this.options.fetchSnapshot();
    const snapshotText = describeSnapshot(snapshot, this.options.timeZone);
    const history = this.history.get(from) ?? [];
    const answer = this.options.assistant
      ? await this.options.assistant.answer({ question: text, snapshotText, history })
      : null;
    await this.options.provider.sendText(from, answer ?? snapshotText);

    if (answer !== null) {
      this.history.set(from, [...history, { question: text, answer }].slice(-HISTORY_TURNS));
    }
  }

  private withinRateLimit(from: string, now: Date): boolean {
    const cutoff = now.getTime() - HOUR_MS;
    const stamps = (this.recent.get(from) ?? []).filter((stamp) => stamp > cutoff);
    if (stamps.length >= this.options.rateLimitPerHour) {
      this.recent.set(from, stamps);
      return false;
    }
    stamps.push(now.getTime());
    this.recent.set(from, stamps);
    return true;
  }
}

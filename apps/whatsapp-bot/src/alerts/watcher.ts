import type { Thresholds } from '../config.js';
import type { KandangSnapshot } from '../agronova/snapshot.js';
import { maskNumber, type SessionWindow, type WhatsAppProvider } from '../whatsapp/provider.js';

import { API_UNREACHABLE, activeConditions, type Condition } from './rules.js';

/** One missed poll is not an outage (the API may be restarting); warn after this many in a row. */
export const UNREACHABLE_AFTER_FAILURES = 3;

export interface WatcherOptions {
  fetchSnapshot: () => Promise<KandangSnapshot>;
  provider: WhatsAppProvider;
  sessions: SessionWindow;
  recipients: readonly string[];
  thresholds: Thresholds;
  timeZone: string;
  cooldownMs: number;
  /** Template for recipients outside the 24-hour window; null = such warnings cannot be sent. */
  template: string | null;
  templateLanguage: string;
  /** True for the real WhatsApp API. The console provider has no 24-hour rule. */
  enforceSessionWindow: boolean;
  now?: () => Date;
  log?: (message: string) => void;
}

interface ActiveCondition {
  condition: Condition;
  /** Whether a warning actually went out for this episode (false when the cooldown held it). */
  announced: boolean;
}

/** Template parameters may not contain line breaks, tabs or long runs of spaces. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Polls the API and warns on transitions: once when a condition starts, once when it ends (for
 * conditions that have a recovery text). State is in memory, so after a restart a condition that
 * is still active is announced again.
 */
export class AlertWatcher {
  private readonly active = new Map<string, ActiveCondition>();
  private readonly lastAnnounced = new Map<string, number>();
  private consecutiveFailures = 0;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly now: () => Date;
  private readonly log: (message: string) => void;

  constructor(private readonly options: WatcherOptions) {
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? ((message) => console.warn(message));
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    const run = () => {
      // A slow poll must not overlap the next one: two ticks would announce the same transition.
      if (this.ticking) return;
      this.ticking = true;
      this.tick()
        .catch((error: unknown) => this.log(`[watcher] poll failed: ${reason(error)}`))
        .finally(() => {
          this.ticking = false;
        });
    };
    run();
    this.timer = setInterval(run, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    const snapshot = await this.options.fetchSnapshot();
    if (!snapshot.apiReachable) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= UNREACHABLE_AFTER_FAILURES) await this.begin(API_UNREACHABLE);
      // Nothing is known about the house right now: leave every other condition as it was.
      return;
    }
    this.consecutiveFailures = 0;
    await this.end(API_UNREACHABLE.key);

    const current = new Map(
      activeConditions(snapshot, this.options.thresholds, this.options.timeZone).map(
        (condition) => [condition.key, condition] as const,
      ),
    );
    const reportingDevice = snapshot.telemetry?.telemetry.device_id ?? null;
    for (const [key, entry] of [...this.active]) {
      if (current.has(key)) continue;
      const { deviceId } = entry.condition;
      if (deviceId !== undefined && deviceId !== reportingDevice) continue;
      await this.end(key);
    }
    for (const condition of current.values()) await this.begin(condition);
  }

  private async begin(condition: Condition): Promise<void> {
    if (this.active.has(condition.key)) return;
    const nowMs = this.now().getTime();
    const last = this.lastAnnounced.get(condition.key);
    // A condition that flaps (sensor reconnecting, value hovering at a threshold) warns once per
    // cooldown instead of on every flip.
    const coolingDown = last !== undefined && nowMs - last < this.options.cooldownMs;
    this.active.set(condition.key, { condition, announced: !coolingDown });
    if (coolingDown) return;
    this.lastAnnounced.set(condition.key, nowMs);
    await this.broadcast(`PERINGATAN AgroNova: ${condition.text}`);
  }

  private async end(key: string): Promise<void> {
    const entry = this.active.get(key);
    if (!entry) return;
    this.active.delete(key);
    if (entry.announced && entry.condition.recoveryText) {
      await this.broadcast(`INFO AgroNova: ${entry.condition.recoveryText}`);
    }
  }

  private async broadcast(text: string): Promise<void> {
    const { provider, sessions, template, templateLanguage, enforceSessionWindow } = this.options;
    if (this.options.recipients.length === 0) {
      this.log(`[watcher] no recipients configured; not sent: ${text}`);
      return;
    }
    for (const recipient of this.options.recipients) {
      try {
        if (!enforceSessionWindow || sessions.isOpen(recipient, this.now())) {
          await provider.sendText(recipient, text);
        } else if (template) {
          await provider.sendTemplate(recipient, template, templateLanguage, [singleLine(text)]);
        } else {
          this.log(
            `[watcher] not delivered to ${maskNumber(recipient)}: outside the 24-hour window and WA_ALERT_TEMPLATE is not set. Message: ${text}`,
          );
        }
      } catch (error) {
        // One failed recipient must not stop the others.
        this.log(`[watcher] delivery to ${maskNumber(recipient)} failed: ${reason(error)}`);
      }
    }
  }
}

import { describe, expect, it } from 'vitest';

import type { KandangSnapshot } from '../agronova/snapshot.js';
import {
  ALERT_VOTE,
  NO_THRESHOLDS,
  NOW,
  RecordingProvider,
  TIME_ZONE,
  UNREACHABLE,
  receipt,
  snapshot,
  visionResult,
} from '../test-fixtures.js';
import { SessionWindow } from '../whatsapp/provider.js';

import { AlertWatcher, type WatcherOptions } from './watcher.js';

const ADMIN = '6281234567890';
const ONLINE = snapshot();
const OFFLINE = snapshot({ telemetry: receipt({ online: false }) });

function setup(overrides: Partial<WatcherOptions> = {}) {
  const provider = new RecordingProvider();
  const sessions = new SessionWindow();
  const state = { next: ONLINE as KandangSnapshot, now: NOW.getTime() };
  const logs: string[] = [];
  const watcher = new AlertWatcher({
    fetchSnapshot: async () => state.next,
    provider,
    sessions,
    recipients: [ADMIN],
    thresholds: NO_THRESHOLDS,
    timeZone: TIME_ZONE,
    cooldownMs: 60_000,
    template: null,
    templateLanguage: 'id',
    enforceSessionWindow: false,
    now: () => new Date(state.now),
    log: (message) => logs.push(message),
    ...overrides,
  });
  const poll = async (next: KandangSnapshot, advanceMs = 10_000) => {
    state.next = next;
    state.now += advanceMs;
    await watcher.tick();
  };
  return { provider, sessions, state, logs, poll };
}

describe('AlertWatcher', () => {
  it('warns once when the device goes offline and once when it returns', async () => {
    const { provider, poll } = setup();
    await poll(ONLINE);
    await poll(OFFLINE);
    await poll(OFFLINE);
    await poll(OFFLINE);
    expect(provider.sent.map((m) => m.body)).toEqual([expect.stringContaining('OFFLINE')]);
    await poll(ONLINE);
    expect(provider.sent).toHaveLength(2);
    expect(provider.sent[1]?.body).toContain('kembali ONLINE');
  });

  it('does not read "no reading held" as a recovery (API restart)', async () => {
    const { provider, poll } = setup();
    await poll(OFFLINE);
    await poll(snapshot({ telemetry: null }));
    expect(provider.sent).toHaveLength(1);
    // Still the same episode once the API has data again: no second warning.
    await poll(OFFLINE);
    expect(provider.sent).toHaveLength(1);
  });

  it('holds a flapping condition to one warning per cooldown', async () => {
    const { provider, poll } = setup();
    await poll(OFFLINE);
    await poll(ONLINE);
    await poll(OFFLINE);
    await poll(ONLINE);
    expect(provider.sent.map((m) => m.body.slice(0, 10))).toEqual(['PERINGATAN', 'INFO AgroN']);
    await poll(OFFLINE, 120_000);
    expect(provider.sent).toHaveLength(3);
  });

  it('warns about an unreachable API only after three failed polls, then reports recovery', async () => {
    const { provider, poll } = setup();
    await poll(UNREACHABLE);
    await poll(UNREACHABLE);
    expect(provider.sent).toHaveLength(0);
    await poll(UNREACHABLE);
    await poll(UNREACHABLE);
    expect(provider.sent.map((m) => m.body)).toEqual([expect.stringContaining('tidak dapat')]);
    await poll(ONLINE);
    expect(provider.sent[1]?.body).toContain('kembali dapat dihubungi');
  });

  it('keeps known conditions while the API is unreachable', async () => {
    const { provider, poll } = setup();
    await poll(OFFLINE);
    await poll(UNREACHABLE);
    await poll(OFFLINE);
    expect(provider.sent).toHaveLength(1);
  });

  it('warns once per vision alert episode', async () => {
    const { provider, poll } = setup();
    const alert = snapshot({ vision: [visionResult('stress', { vote: ALERT_VOTE })] });
    await poll(alert);
    await poll(alert);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.body).toContain('Kamera CAM-01');
  });

  it('uses the template outside the 24-hour window and plain text inside it', async () => {
    const { provider, sessions, state, poll } = setup({
      enforceSessionWindow: true,
      template: 'agronova_alert',
    });
    await poll(OFFLINE);
    expect(provider.sent[0]).toMatchObject({ kind: 'template', template: 'agronova_alert' });
    expect(provider.sent[0]?.body).not.toMatch(/\n/);
    sessions.recordInbound(ADMIN, new Date(state.now));
    await poll(ONLINE);
    expect(provider.sent[1]?.kind).toBe('text');
  });

  it('logs instead of sending when the window is closed and no template is set', async () => {
    const { provider, logs, poll } = setup({ enforceSessionWindow: true });
    await poll(OFFLINE);
    expect(provider.sent).toHaveLength(0);
    expect(logs.join('\n')).toContain('WA_ALERT_TEMPLATE');
  });

  it('still reaches the other recipients when one delivery fails', async () => {
    const { provider, poll } = setup({ recipients: ['111', ADMIN] });
    provider.failFor = '111';
    await poll(OFFLINE);
    expect(provider.sent.map((m) => m.to)).toEqual([ADMIN]);
  });
});

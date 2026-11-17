import { describe, expect, it } from 'vitest';

import { loadConfig, normalizeNumber } from './config.js';

const META = {
  WA_PROVIDER: 'meta',
  WA_ACCESS_TOKEN: 'token',
  WA_APP_SECRET: 'secret',
  WA_VERIFY_TOKEN: 'verify',
  WA_PHONE_NUMBER_ID: '1234567890',
  WA_ALLOWED_NUMBERS: '+62 812-3456-7890, 6281100002222',
};

describe('loadConfig', () => {
  it('starts in console mode with safe defaults when nothing is set', () => {
    const config = loadConfig({});
    expect(config.provider).toBe('console');
    expect(config.meta).toBeNull();
    expect(config.port).toBe(4100);
    expect(config.apiBaseUrl).toBe('http://localhost:4000');
    expect(config.llmBaseUrl).toBeNull();
    expect(config.llmModel).toBe('qwen3:4b');
    expect(config.llmTimeoutMs).toBe(60_000);
    expect(config.thresholds).toEqual({
      tempMaxC: null,
      tempMinC: null,
      humidityMaxPct: null,
      humidityMinPct: null,
    });
  });

  it('treats blank values (as copied from .env.example) like unset ones', () => {
    const config = loadConfig({ WA_BOT_PORT: '', WA_TEMP_MAX_C: ' ', WA_LLM_BASE_URL: '' });
    expect(config.port).toBe(4100);
    expect(config.thresholds.tempMaxC).toBeNull();
    expect(config.llmBaseUrl).toBeNull();
  });

  it('reads the open-source LLM endpoint and rejects a malformed URL', () => {
    const config = loadConfig({
      WA_LLM_BASE_URL: 'http://localhost:11434/v1/',
      WA_LLM_MODEL: 'qwen3:8b',
    });
    expect(config.llmBaseUrl).toBe('http://localhost:11434/v1');
    expect(config.llmModel).toBe('qwen3:8b');
    expect(config.llmApiKey).toBeNull();
    expect(() => loadConfig({ WA_LLM_BASE_URL: 'localhost:11434' })).toThrow(/WA_LLM_BASE_URL/);
  });

  it('normalises phone numbers and defaults alert recipients to the allowlist', () => {
    const config = loadConfig(META);
    expect([...config.allowedNumbers]).toEqual(['6281234567890', '6281100002222']);
    expect(config.alertRecipients).toEqual(['6281234567890', '6281100002222']);
    expect(normalizeNumber('+62 (812) 000-111')).toBe('62812000111');
  });

  it('uses WA_ALERT_RECIPIENTS when given', () => {
    const config = loadConfig({ ...META, WA_ALERT_RECIPIENTS: '6289900001111' });
    expect(config.alertRecipients).toEqual(['6289900001111']);
  });

  it('refuses meta mode with a missing credential, naming it', () => {
    expect(() => loadConfig({ ...META, WA_APP_SECRET: '' })).toThrow(/WA_APP_SECRET/);
  });

  it('refuses meta mode without an allowlist', () => {
    expect(() => loadConfig({ ...META, WA_ALLOWED_NUMBERS: '' })).toThrow(/WA_ALLOWED_NUMBERS/);
  });

  it('refuses to start with device control switched on', () => {
    expect(() => loadConfig({ WA_CONTROL_ENABLED: 'true' })).toThrow(/not implemented/);
  });

  it('rejects malformed numbers and unknown time zones', () => {
    expect(() => loadConfig({ WA_BOT_PORT: '4100.5' })).toThrow(/WA_BOT_PORT/);
    expect(() => loadConfig({ WA_TEMP_MAX_C: 'panas' })).toThrow(/WA_TEMP_MAX_C/);
    expect(() => loadConfig({ WA_DISPLAY_TIMEZONE: 'Mars/Olympus' })).toThrow(/time zone/);
  });

  it('reads optional thresholds as numbers', () => {
    const config = loadConfig({ WA_TEMP_MAX_C: '32.5', WA_HUMIDITY_MIN_PCT: '40' });
    expect(config.thresholds.tempMaxC).toBe(32.5);
    expect(config.thresholds.humidityMinPct).toBe(40);
  });
});

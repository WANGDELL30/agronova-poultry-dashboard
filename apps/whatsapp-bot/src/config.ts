import { z } from 'zod';

export interface MetaConfig {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
}

export interface Thresholds {
  tempMaxC: number | null;
  tempMinC: number | null;
  humidityMaxPct: number | null;
  humidityMinPct: number | null;
}

export interface BotConfig {
  host: string;
  port: number;
  apiBaseUrl: string;
  apiTimeoutMs: number;
  deviceId: string | null;
  provider: 'console' | 'meta';
  /** Present when WA_PROVIDER=meta. */
  meta: MetaConfig | null;
  /** Console mode only: verify webhook signatures when a secret is set, skip when it is not. */
  consoleAppSecret: string | null;
  allowedNumbers: ReadonlySet<string>;
  alertRecipients: readonly string[];
  alertTemplate: string | null;
  alertTemplateLanguage: string;
  pollIntervalMs: number;
  alertCooldownMs: number;
  thresholds: Thresholds;
  /** OpenAI-compatible server (Ollama, vLLM, ...). Null = no LLM: questions get the summary. */
  llmBaseUrl: string | null;
  llmModel: string;
  llmApiKey: string | null;
  llmTimeoutMs: number;
  rateLimitPerHour: number;
  displayTimeZone: string;
}

/** WhatsApp ids are the number with country code, digits only (no "+", spaces or dashes). */
export function normalizeNumber(value: string): string {
  return value.replace(/\D/g, '');
}

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalText = z.preprocess(blankToUndefined, z.string().trim().optional());

const wholeNumber = (min: number, max: number, fallback: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d+$/, 'must be a whole number (digits only)')
      .transform(Number)
      .pipe(z.number().min(min).max(max))
      // zod 4: the default is the parsed value and skips the checks above (AUDIT S23).
      .default(fallback),
  );

const optionalDecimal = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'must be a decimal number')
    .transform(Number)
    .optional(),
);

const numberList = z.preprocess(
  blankToUndefined,
  z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map(normalizeNumber)
        .filter((entry) => entry.length > 0),
    ),
);

const envSchema = z.object({
  WA_BOT_HOST: optionalText,
  WA_BOT_PORT: wholeNumber(1, 65535, 4100),
  AGRONOVA_API_BASE_URL: z.preprocess(blankToUndefined, z.url().default('http://localhost:4000')),
  AGRONOVA_API_TIMEOUT_MS: wholeNumber(100, 120_000, 5_000),
  AGRONOVA_DEVICE_ID: optionalText,
  WA_PROVIDER: z.preprocess(blankToUndefined, z.enum(['console', 'meta']).default('console')),
  WA_ACCESS_TOKEN: optionalText,
  WA_APP_SECRET: optionalText,
  WA_VERIFY_TOKEN: optionalText,
  WA_PHONE_NUMBER_ID: optionalText,
  WA_GRAPH_API_VERSION: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^v\d+\.\d+$/, 'must look like v23.0')
      .default('v23.0'),
  ),
  WA_ALLOWED_NUMBERS: numberList,
  WA_ALERT_RECIPIENTS: numberList,
  WA_POLL_INTERVAL_MS: wholeNumber(1_000, 3_600_000, 10_000),
  WA_ALERT_COOLDOWN_MS: wholeNumber(0, 86_400_000, 900_000),
  WA_ALERT_TEMPLATE: optionalText,
  WA_ALERT_TEMPLATE_LANGUAGE: z.preprocess(blankToUndefined, z.string().trim().default('id')),
  WA_TEMP_MAX_C: optionalDecimal,
  WA_TEMP_MIN_C: optionalDecimal,
  WA_HUMIDITY_MAX_PCT: optionalDecimal,
  WA_HUMIDITY_MIN_PCT: optionalDecimal,
  // `z.url()` alone accepts "localhost:11434" (scheme "localhost:"), which fetch rejects.
  WA_LLM_BASE_URL: z.preprocess(
    blankToUndefined,
    z
      .url()
      .regex(/^https?:\/\//, 'must start with http:// or https://')
      .optional(),
  ),
  WA_LLM_MODEL: z.preprocess(blankToUndefined, z.string().trim().default('qwen3:4b')),
  WA_LLM_API_KEY: optionalText,
  WA_LLM_TIMEOUT_MS: wholeNumber(1_000, 600_000, 60_000),
  WA_RATE_LIMIT_PER_HOUR: wholeNumber(1, 10_000, 30),
  WA_DISPLAY_TIMEZONE: z.preprocess(blankToUndefined, z.string().trim().default('Asia/Jakarta')),
  WA_CONTROL_ENABLED: z.preprocess(blankToUndefined, z.string().trim().default('false')),
});

function fail(message: string): never {
  throw new Error(`Invalid WhatsApp bot configuration: ${message}`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    fail(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  const values = parsed.data;

  // Device control has no command path yet (no actuators, no command endpoint). Refuse to start rather than
  // let anyone believe the switch does something.
  if (values.WA_CONTROL_ENABLED !== 'false') {
    fail('WA_CONTROL_ENABLED must be "false": device control is not implemented.');
  }

  try {
    new Intl.DateTimeFormat('id-ID', { timeZone: values.WA_DISPLAY_TIMEZONE });
  } catch {
    fail(`WA_DISPLAY_TIMEZONE "${values.WA_DISPLAY_TIMEZONE}" is not a known time zone.`);
  }

  let meta: MetaConfig | null = null;
  if (values.WA_PROVIDER === 'meta') {
    const required = {
      WA_ACCESS_TOKEN: values.WA_ACCESS_TOKEN,
      WA_APP_SECRET: values.WA_APP_SECRET,
      WA_VERIFY_TOKEN: values.WA_VERIFY_TOKEN,
      WA_PHONE_NUMBER_ID: values.WA_PHONE_NUMBER_ID,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) fail(`WA_PROVIDER=meta requires ${missing.join(', ')}.`);
    if (values.WA_ALLOWED_NUMBERS.length === 0) {
      fail('WA_PROVIDER=meta requires at least one number in WA_ALLOWED_NUMBERS.');
    }
    meta = {
      accessToken: required.WA_ACCESS_TOKEN as string,
      appSecret: required.WA_APP_SECRET as string,
      verifyToken: required.WA_VERIFY_TOKEN as string,
      phoneNumberId: required.WA_PHONE_NUMBER_ID as string,
      graphApiVersion: values.WA_GRAPH_API_VERSION,
    };
  }

  return {
    host: values.WA_BOT_HOST ?? '0.0.0.0',
    port: values.WA_BOT_PORT,
    apiBaseUrl: values.AGRONOVA_API_BASE_URL.replace(/\/+$/, ''),
    apiTimeoutMs: values.AGRONOVA_API_TIMEOUT_MS,
    deviceId: values.AGRONOVA_DEVICE_ID ?? null,
    provider: values.WA_PROVIDER,
    meta,
    consoleAppSecret: values.WA_PROVIDER === 'console' ? (values.WA_APP_SECRET ?? null) : null,
    allowedNumbers: new Set(values.WA_ALLOWED_NUMBERS),
    alertRecipients:
      values.WA_ALERT_RECIPIENTS.length > 0
        ? [...new Set(values.WA_ALERT_RECIPIENTS)]
        : [...new Set(values.WA_ALLOWED_NUMBERS)],
    alertTemplate: values.WA_ALERT_TEMPLATE ?? null,
    alertTemplateLanguage: values.WA_ALERT_TEMPLATE_LANGUAGE,
    pollIntervalMs: values.WA_POLL_INTERVAL_MS,
    alertCooldownMs: values.WA_ALERT_COOLDOWN_MS,
    thresholds: {
      tempMaxC: values.WA_TEMP_MAX_C ?? null,
      tempMinC: values.WA_TEMP_MIN_C ?? null,
      humidityMaxPct: values.WA_HUMIDITY_MAX_PCT ?? null,
      humidityMinPct: values.WA_HUMIDITY_MIN_PCT ?? null,
    },
    llmBaseUrl: values.WA_LLM_BASE_URL?.replace(/\/+$/, '') ?? null,
    llmModel: values.WA_LLM_MODEL,
    llmApiKey: values.WA_LLM_API_KEY ?? null,
    llmTimeoutMs: values.WA_LLM_TIMEOUT_MS,
    rateLimitPerHour: values.WA_RATE_LIMIT_PER_HOUR,
    displayTimeZone: values.WA_DISPLAY_TIMEZONE,
  };
}

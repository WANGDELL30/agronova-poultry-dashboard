import 'dotenv/config';

import { AgronovaApiClient } from './agronova/api-client.js';
import { fetchSnapshot } from './agronova/snapshot.js';
import { AlertWatcher } from './alerts/watcher.js';
import { OpenAiCompatibleAssistant } from './chat/assistant.js';
import { MessageRouter } from './chat/router.js';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { ConsoleProvider } from './whatsapp/console-provider.js';
import { MetaProvider } from './whatsapp/meta-provider.js';
import { SessionWindow, type WhatsAppProvider } from './whatsapp/provider.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const api = new AgronovaApiClient(config.apiBaseUrl, config.apiTimeoutMs);
  const snapshot = () => fetchSnapshot(api, config.deviceId);
  const sessions = new SessionWindow();
  const provider: WhatsAppProvider = config.meta
    ? new MetaProvider(config.meta)
    : new ConsoleProvider();
  const assistant = config.llmBaseUrl
    ? new OpenAiCompatibleAssistant({
        baseUrl: config.llmBaseUrl,
        model: config.llmModel,
        apiKey: config.llmApiKey,
        timeoutMs: config.llmTimeoutMs,
      })
    : null;

  const router = new MessageRouter({
    allowedNumbers: config.allowedNumbers,
    provider,
    sessions,
    fetchSnapshot: snapshot,
    assistant,
    timeZone: config.displayTimeZone,
    rateLimitPerHour: config.rateLimitPerHour,
  });
  const watcher = new AlertWatcher({
    fetchSnapshot: snapshot,
    provider,
    sessions,
    recipients: config.alertRecipients,
    thresholds: config.thresholds,
    timeZone: config.displayTimeZone,
    cooldownMs: config.alertCooldownMs,
    template: config.alertTemplate,
    templateLanguage: config.alertTemplateLanguage,
    enforceSessionWindow: config.provider === 'meta',
  });

  const appSecret = config.meta?.appSecret ?? config.consoleAppSecret;
  const app = buildServer({
    verifyToken: config.meta?.verifyToken ?? null,
    appSecret,
    phoneNumberId: config.meta?.phoneNumberId ?? null,
    onMessage: (message) => void router.handle(message),
    health: () => ({
      status: 'ok',
      provider: config.provider,
      llm_configured: assistant !== null,
      llm_model: assistant !== null ? config.llmModel : null,
      control_enabled: false,
    }),
    logger: true,
  });

  if (config.provider === 'console') {
    app.log.warn('WA_PROVIDER=console: replies and warnings are printed here, nothing is sent.');
    if (appSecret === null) {
      app.log.warn('WA_APP_SECRET is empty: webhook signatures are not checked (console mode).');
    }
  } else if (config.alertTemplate === null) {
    app.log.warn(
      'WA_ALERT_TEMPLATE is empty: warnings reach only numbers that wrote to the bot in the last 24 hours.',
    );
  }
  if (config.allowedNumbers.size === 0) {
    app.log.warn('WA_ALLOWED_NUMBERS is empty: every incoming message will be ignored.');
  }
  if (assistant === null) {
    app.log.warn('WA_LLM_BASE_URL is empty: questions get the fixed status summary.');
  } else {
    app.log.info(`Answers come from model "${config.llmModel}" at ${config.llmBaseUrl}.`);
  }

  const shutdown = () => {
    watcher.stop();
    void app.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
  watcher.start(config.pollIntervalMs);
}

void bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

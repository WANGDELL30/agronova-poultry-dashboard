import Fastify, { type FastifyInstance } from 'fastify';

import { safeEqual, verifySignature } from './whatsapp/signature.js';
import { extractInboundMessages, type InboundMessage } from './whatsapp/webhook-schema.js';

export interface ServerOptions {
  /** Token Meta echoes when the webhook is registered. Null = registration is refused. */
  verifyToken: string | null;
  /** App secret for `X-Hub-Signature-256`. Null = signatures are not checked (console mode only). */
  appSecret: string | null;
  /** Our WhatsApp business number id; deliveries for another number are ignored. */
  phoneNumberId: string | null;
  onMessage: (message: InboundMessage) => void;
  health: () => Record<string, unknown>;
  logger?: boolean;
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  // The signature covers the exact bytes Meta sent, so the body is kept as a Buffer and parsed
  // only after it has been verified.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.get('/health', async () => options.health());

  // Webhook registration handshake.
  app.get('/webhook', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (
      options.verifyToken === null ||
      query['hub.mode'] !== 'subscribe' ||
      typeof token !== 'string' ||
      typeof challenge !== 'string' ||
      !safeEqual(token, options.verifyToken)
    ) {
      return reply.code(403).send({ error: 'verification_failed' });
    }
    return reply.code(200).type('text/plain').send(challenge);
  });

  app.post('/webhook', async (request, reply) => {
    const raw = request.body;
    if (!Buffer.isBuffer(raw)) return reply.code(400).send({ error: 'invalid_body' });

    if (options.appSecret !== null) {
      const header = request.headers['x-hub-signature-256'];
      const signature = Array.isArray(header) ? header[0] : header;
      if (!verifySignature(raw, signature, options.appSecret)) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return reply.code(400).send({ error: 'invalid_json' });
    }
    const messages = extractInboundMessages(payload, options.phoneNumberId);
    if (messages === null) return reply.code(400).send({ error: 'unsupported_payload' });

    // Meta retries a delivery that is not acknowledged quickly, and an LLM answer can take longer
    // than that. Acknowledge first; the handler does its own error handling.
    for (const message of messages) options.onMessage(message);
    return reply.code(200).send({ received: messages.length });
  });

  return app;
}

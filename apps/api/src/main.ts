import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import fastifyMultipart from '@fastify/multipart';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { parseAllowedOrigins } from './cors.js';
import { parseTrustProxy } from './trust-proxy.js';

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '4000');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be an integer between 1 and 65535; received "${value}".`);
  }

  return port;
}

async function bootstrap(): Promise<void> {
  const allowedOrigins = parseAllowedOrigins(process.env.WEB_ORIGIN);
  // Behind cloudflared on the same machine every request comes from 127.0.0.1; trusting only that
  // proxy makes request.ip (logs, future rate limits) the real client address (AUDIT D17).
  const trustProxy = parseTrustProxy(process.env.API_TRUST_PROXY);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy }),
  );

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  });
  await app.register(fastifyMultipart);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');

  const host = process.env.API_HOST ?? '0.0.0.0';
  const port = parsePort(process.env.API_PORT);

  await app.listen(port, host);
  Logger.log(`AgroNova API listening on http://${host}:${port}`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  Logger.error(message, undefined, 'Bootstrap');
  process.exitCode = 1;
});

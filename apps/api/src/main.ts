import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '4000');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be an integer between 1 and 65535; received "${value}".`);
  }

  return port;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET'],
  });
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

import { modelInputsUnavailable } from '@agronova/mortality-model';
import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { MortalityController } from './mortality.controller.js';

/**
 * POST predict/diagnostics answer 409 before Fastify parses the body, exactly like the Vercel routes
 * that never read it (AUDIT K8). Without this, malformed JSON was 400 and a foreign Content-Type 415.
 * Middleware runs in Fastify's onRequest stage, ahead of body parsing.
 */
export function rejectWithoutReadingBody(
  _request: IncomingMessage,
  response: ServerResponse,
): void {
  response.statusCode = 409;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(modelInputsUnavailable));
}

@Module({ controllers: [MortalityController] })
export class MortalityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(rejectWithoutReadingBody)
      .forRoutes(
        { path: 'mortality/predict', method: RequestMethod.POST },
        { path: 'mortality/diagnostics', method: RequestMethod.POST },
      );
  }
}

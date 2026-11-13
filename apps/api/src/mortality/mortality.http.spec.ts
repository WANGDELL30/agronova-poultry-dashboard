import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MortalityModule } from './mortality.module.js';

describe('Mortality endpoints over HTTP (K8)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(MortalityModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());

  const post = (path: string, payload: string, contentType: string) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/mortality/${path}`,
      headers: { 'content-type': contentType },
      payload,
    });

  it.each(['predict', 'diagnostics'])(
    'POST %s ignores the body like the Vercel route: always 409 MODEL_INPUTS_UNAVAILABLE',
    async (path) => {
      for (const [payload, type] of [
        ['{"sequence": [1, 2', 'application/json'], // malformed JSON (was 400)
        ['<a/>', 'application/xml'], // foreign content type (was 415)
        ['{}', 'application/json'],
      ]) {
        const res = await post(path, payload!, type!);
        expect(res.statusCode, `${path} ${type}`).toBe(409);
        expect(res.json()).toMatchObject({
          code: 'MODEL_INPUTS_UNAVAILABLE',
          mortality_prediction: null,
        });
      }
    },
  );
});

import { validTelemetryV1Example } from '@agronova/telemetry-schema';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TelemetryModule } from './telemetry.module.js';

describe('TelemetryController (HTTP)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(TelemetryModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry',
      payload: validTelemetryV1Example,
    });
  });
  afterAll(() => app.close());

  const latest = (query: string) =>
    app.inject({ method: 'GET', url: `/api/v1/telemetry/latest${query}` });

  it('filters by device_id and treats a blank one as absent', async () => {
    const id = validTelemetryV1Example.device_id;
    expect((await latest(`?device_id=${id}`)).statusCode).toBe(200);
    expect((await latest(`?device_id=%20${id}%20`)).statusCode).toBe(200);
    expect((await latest('?device_id=other')).statusCode).toBe(204);
    expect((await latest('?device_id=%20')).statusCode).toBe(200);
  });

  it('rejects a repeated device_id with 400 instead of 500 (H10)', async () => {
    const res = await latest('?device_id=a&device_id=b');
    expect(res.statusCode).toBe(400);
  });
});

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

describe('POST /telemetry is idempotent per message_id (R5)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(TelemetryModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());

  const reading = (messageId: string, celsius: number, device = 'dev-r5') => ({
    ...validTelemetryV1Example,
    device_id: device,
    message_id: messageId,
    readings: {
      ...validTelemetryV1Example.readings,
      air_temperature_c: { raw: celsius, filtered: celsius },
    },
  });
  const send = (payload: object) =>
    app.inject({ method: 'POST', url: '/api/v1/telemetry', payload });
  const latestCelsius = async (device = 'dev-r5') =>
    (
      await app.inject({ method: 'GET', url: `/api/v1/telemetry/latest?device_id=${device}` })
    ).json().telemetry.readings.air_temperature_c.filtered;

  it('W1, W2, retransmitted W1: the replay gets the old receipt and latest stays W2', async () => {
    const w1 = reading('11111111-1111-4111-8111-111111111111', 21);
    const first = await send(w1);
    expect(first.statusCode).toBe(201);
    expect((await send(reading('22222222-2222-4222-8222-222222222222', 22))).statusCode).toBe(201);
    const replay = await send(w1);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().received_at).toBe(first.json().received_at);
    expect(await latestCelsius()).toBe(22);
  });

  it('rejects the same message_id with a different payload as 409 and keeps the stored reading', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    expect((await send(reading(id, 25, 'dev-r5b'))).statusCode).toBe(201);
    const conflict = await send(reading(id, 30, 'dev-r5b'));
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: 'duplicate_message_id' });
    expect(await latestCelsius('dev-r5b')).toBe(25);
  });
});

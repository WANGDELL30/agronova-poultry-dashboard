import { validTelemetryV1Example } from '@agronova/telemetry-schema';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
    expect(res.json().message).toBe('Invalid query parameter device_id: must be given once.');
  });

  // The 400 body carries the zod 4 issues (AUDIT S23): code, path and message per field, and never
  // the rejected input itself.
  it('answers an invalid body with 400 invalid_telemetry and zod issues without the input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry',
      payload: { ...validTelemetryV1Example, message_id: 'not-a-guid', extra: 'secret-ish' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('invalid_telemetry');
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_format', path: ['message_id'] }),
        expect.objectContaining({ code: 'unrecognized_keys', keys: ['extra'], path: [] }),
      ]),
    );
    for (const issue of body.issues) {
      expect(typeof issue.message).toBe('string');
      expect(issue).not.toHaveProperty('input');
    }
    expect(res.body).not.toContain('secret-ish');
  });

  it('accepts a message_id without RFC version and variant bits (z.guid(), S23)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry',
      payload: {
        ...validTelemetryV1Example,
        device_id: 'GUID-DEVICE',
        message_id: '12345678-1234-0234-c234-123456789abc',
      },
    });
    expect(res.statusCode).toBe(201);
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

describe('POST /telemetry with TELEMETRY_DEVICE_KEYS set', () => {
  const KEY_01 = 'key-for-esp32-01-0123456789';
  const KEY_02 = 'key-for-esp32-02-0123456789';
  let app: NestFastifyApplication;

  beforeAll(async () => {
    vi.stubEnv('TELEMETRY_DEVICE_KEYS', `ESP32-01=${KEY_01},ESP32-02=${KEY_02}`);
    app = await NestFactory.create<NestFastifyApplication>(TelemetryModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  let counter = 0;
  const reading = (device: string) => ({
    ...validTelemetryV1Example,
    device_id: device,
    message_id: `44444444-4444-4444-8444-${String(++counter).padStart(12, '0')}`,
  });
  const send = (payload: object, key?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/telemetry',
      payload,
      headers: key === undefined ? {} : { 'x-device-key': key },
    });
  const latestStatus = async (device: string) =>
    (await app.inject({ method: 'GET', url: `/api/v1/telemetry/latest?device_id=${device}` }))
      .statusCode;

  it('accepts a reading whose device_id matches its key', async () => {
    expect((await send(reading('ESP32-01'), KEY_01)).statusCode).toBe(201);
    expect(await latestStatus('ESP32-01')).toBe(200);
  });

  it('rejects a missing or unknown key with 401 and stores nothing', async () => {
    for (const key of [undefined, '', 'not-a-configured-key-000']) {
      const res = await send(reading('ESP32-02'), key);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'invalid_device_key' });
    }
    expect(await latestStatus('ESP32-02')).toBe(204);
  });

  it('checks the key before the body: an invalid body without a key is 401, not 400', async () => {
    const res = await send({ nonsense: true });
    expect(res.statusCode).toBe(401);
    expect(res.json()).not.toHaveProperty('issues');
  });

  it('still validates the body once the key is valid', async () => {
    const res = await send({ nonsense: true }, KEY_01);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_telemetry' });
  });

  it('rejects a key used for another device with 403 and stores nothing (S15)', async () => {
    for (const device of ['ESP32-02', 'UNREGISTERED-99']) {
      const res = await send(reading(device), KEY_01);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'device_id_mismatch' });
      expect(await latestStatus(device)).toBe(204);
    }
  });

  it('keeps reads open for the dashboard', async () => {
    expect(await latestStatus('ESP32-01')).toBe(200);
  });
});

import { getModelStatus, mortalityHttpCases } from '@agronova/mortality-model';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MortalityModule } from './mortality.module.js';

vi.mock('@agronova/mortality-model', async (importOriginal) => {
  const original = await importOriginal<typeof import('@agronova/mortality-model')>();
  return { ...original, getModelStatus: vi.fn(original.getModelStatus) };
});

/** Same cases as apps/web/app/api/v1/mortality/parity.test.ts (AUDIT K11). */
describe('NestJS mortality matches the shared HTTP fixture', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    app = await NestFactory.create<NestFastifyApplication>(MortalityModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());

  it.each(mortalityHttpCases.map((c) => [c.name, c] as const))('%s', async (_name, testCase) => {
    if (!testCase.modelLoads) vi.mocked(getModelStatus).mockRejectedValueOnce(new Error('broken'));
    const res = await app.inject({
      method: testCase.method,
      url: `/api/v1/mortality/${testCase.path}`,
      headers: testCase.contentType ? { 'content-type': testCase.contentType } : {},
      payload: testCase.requestBody,
    });
    expect(res.statusCode).toBe(testCase.status);
    expect(res.json()).toMatchObject(testCase.body);
    expect(res.headers['cache-control']).toBe(testCase.cacheControl);
  });
});

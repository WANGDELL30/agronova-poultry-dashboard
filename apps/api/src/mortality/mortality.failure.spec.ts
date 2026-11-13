import 'reflect-metadata';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const { failure } = vi.hoisted(() => ({ failure: new Error('Model weight checksum mismatch.') }));
vi.mock('@agronova/mortality-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agronova/mortality-model')>()),
  getModelStatus: vi.fn().mockRejectedValue(failure),
}));

const { MortalityController } = await import('./mortality.controller.js');

describe('MortalityController model failure (H12)', () => {
  it('logs the cause once before answering 503', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const controller = new MortalityController();
    await expect(controller.model()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.model()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('checksum mismatch');
    error.mockRestore();
  });
});

/** Importing and booting Nest inside the test takes > 5 s when the whole suite runs in parallel. */
const BOOT_TIMEOUT_MS = 30_000;

describe('MortalityController model failure over HTTP (K9)', () => {
  it(
    'sends no-store on the 503 too',
    async () => {
      const { NestFactory } = await import('@nestjs/core');
      const { FastifyAdapter } = await import('@nestjs/platform-fastify');
      const { MortalityModule } = await import('./mortality.module.js');
      const app = await NestFactory.create(MortalityModule, new FastifyAdapter(), {
        logger: false,
      });
      try {
        await app.init();
        const fastify = app.getHttpAdapter().getInstance() as {
          ready(): Promise<void>;
          inject(o: object): Promise<{ statusCode: number; headers: Record<string, string> }>;
        };
        await fastify.ready();
        const res = await fastify.inject({ method: 'GET', url: '/mortality/model' });
        expect(res.statusCode).toBe(503);
        expect(res.headers['cache-control']).toBe('no-store');
      } finally {
        await app.close();
      }
    },
    BOOT_TIMEOUT_MS,
  );
});

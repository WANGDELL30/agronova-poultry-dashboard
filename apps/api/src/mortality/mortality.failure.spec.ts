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

import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MortalityController } from './mortality.controller.js';

describe('MortalityController', () => {
  const controller = new MortalityController();
  it('exposes real model readiness', async () => {
    expect((await controller.model()).runtime_status).toBe('ready');
  });
  it('blocks public diagnostics while required inputs are unavailable', () => {
    expect(() => controller.diagnostics()).toThrow(ConflictException);
  });
  it('blocks operational prediction until a non-gas model is retrained', () => {
    expect(() => controller.predict()).toThrow(ConflictException);
  });
});

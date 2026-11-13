// @vitest-environment node
import { getModelStatus, mortalityHttpCases } from '@agronova/mortality-model';
import { describe, expect, it, vi } from 'vitest';

import { POST as diagnostics } from './diagnostics/route';
import { GET as model } from './model/route';
import { POST as predict } from './predict/route';

vi.mock('@agronova/mortality-model', async (importOriginal) => {
  const original = await importOriginal<typeof import('@agronova/mortality-model')>();
  return { ...original, getModelStatus: vi.fn() };
});

const handlers = { model, predict, diagnostics } as const;

/** Same cases as apps/api/src/mortality/mortality.parity.spec.ts (AUDIT K11). */
describe('Vercel mortality matches the shared HTTP fixture', () => {
  it.each(mortalityHttpCases.map((c) => [c.name, c] as const))('%s', async (_name, testCase) => {
    const original = await vi.importActual<typeof import('@agronova/mortality-model')>(
      '@agronova/mortality-model',
    );
    // Set per test: the web config restores mocks before each test.
    if (testCase.modelLoads) vi.mocked(getModelStatus).mockImplementation(original.getModelStatus);
    else vi.mocked(getModelStatus).mockRejectedValue(new Error('broken'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = handlers[testCase.path] as (request: Request) => Promise<Response>;
    const response = await handler(
      new Request(`http://localhost/api/v1/mortality/${testCase.path}`, {
        method: testCase.method,
        headers: testCase.contentType ? { 'content-type': testCase.contentType } : {},
        body: testCase.requestBody,
      }),
    );
    expect(response.status).toBe(testCase.status);
    expect(await response.json()).toMatchObject(testCase.body);
    expect(response.headers.get('cache-control')).toBe(testCase.cacheControl);
  });
});

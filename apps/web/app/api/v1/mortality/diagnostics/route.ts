// Contract subpath only: the constant 409 must not load TensorFlow.js on a cold start (D15).
import { modelInputsUnavailable } from '@agronova/mortality-model/contract';

export const runtime = 'nodejs';

export async function POST() {
  // no-store like every NestJS mortality response (K9).
  return Response.json(modelInputsUnavailable, {
    status: 409,
    headers: { 'Cache-Control': 'no-store' },
  });
}

import { modelInputsUnavailable } from '@agronova/mortality-model';

export const runtime = 'nodejs';

export async function POST() {
  // no-store like every NestJS mortality response (K9).
  return Response.json(modelInputsUnavailable, {
    status: 409,
    headers: { 'Cache-Control': 'no-store' },
  });
}

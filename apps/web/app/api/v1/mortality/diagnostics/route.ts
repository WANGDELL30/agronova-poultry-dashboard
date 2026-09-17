import { modelInputsUnavailable } from '@agronova/mortality-model';

export const runtime = 'nodejs';

export async function POST() {
  return Response.json(modelInputsUnavailable, { status: 409 });
}

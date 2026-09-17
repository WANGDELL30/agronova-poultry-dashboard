import { getModelStatus } from '@agronova/mortality-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getModelStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ code: 'MODEL_UNAVAILABLE' }, { status: 503 });
  }
}

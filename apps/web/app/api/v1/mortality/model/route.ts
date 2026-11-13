import { getModelStatus, reportModelFailure } from '@agronova/mortality-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getModelStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    reportModelFailure(error, (message) => console.error(message)); // once per failure (H12)
    return Response.json(
      { code: 'MODEL_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }, // K9
    );
  }
}

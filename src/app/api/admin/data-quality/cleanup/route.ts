// ─── Data Quality Cleanup API ───
// POST — Run autonomous cleanup
//   Body: { dryRun?: boolean, types?: string[] }
//   Default dryRun=true for safety.

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runAutonomousCleanup } from '@/lib/data-quality/cleanup';
import { apiSuccess, apiError, unauthorized, validationError } from '@/lib/api/errors';

async function checkAdminAuth(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session && (session.user as any).role === 'ADMIN') return true;

  const apiKey = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const configuredKey = process.env.SCRAPE_API_KEY;
  if (configuredKey && apiKey === configuredKey) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) {
    return unauthorized('Valid admin session or API key required');
  }

  try {
    const body = await req.json().catch(() => ({}));

    if (body.types && !Array.isArray(body.types)) {
      return validationError('types must be an array of cleanup types');
    }

    const result = await runAutonomousCleanup({
      dryRun: body.dryRun !== false, // Default dry-run for safety
      types: body.types,
    });

    const statusCode = result.dryRun ? 200 : 201;
    return apiSuccess(result, statusCode);
  } catch (error) {
    console.error('[DataQuality] Cleanup failed:', error);
    return apiError(
      500,
      'CLEANUP_FAILED',
      error instanceof Error ? error.message : 'Unknown cleanup error'
    );
  }
}

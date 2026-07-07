// ─── Data Quality Scan API ───
// GET  — Run a scan (supports ?types=garbage,duplicate&limit=50)
// POST — Run a full scan with JSON body options

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runFullScan } from '@/lib/data-quality/scanner';
import { apiSuccess, apiError, unauthorized, validationError } from '@/lib/api/errors';

async function checkAdminAuth(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session && (session.user as any).role === 'ADMIN') return true;

  const apiKey = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const configuredKey = process.env.SCRAPE_API_KEY;
  if (configuredKey && apiKey === configuredKey) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) {
    return unauthorized('Valid admin session or API key required');
  }

  try {
    const { searchParams } = new URL(req.url);
    const typesParam = searchParams.get('types');
    const limitParam = searchParams.get('limit');

    const types = typesParam
      ? (typesParam.split(',') as any[])
      : undefined;

    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const result = await runFullScan({ types, limit });

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        action: 'DATA_QUALITY_SCAN',
        entityType: 'SYSTEM',
        newData: {
          totalIssues: result.totalIssues,
          byType: result.byType,
          bySeverity: result.bySeverity,
          autoFixable: result.autoFixable,
          needsReview: result.needsReview,
        } as any,
      },
    });

    return apiSuccess(result);
  } catch (error) {
    console.error('[DataQuality] Scan failed:', error);
    return apiError(
      500,
      'SCAN_FAILED',
      error instanceof Error ? error.message : 'Unknown scan error'
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) {
    return unauthorized('Valid admin session or API key required');
  }

  try {
    const body = await req.json().catch(() => ({}));

    if (body.types && !Array.isArray(body.types)) {
      return validationError('types must be an array of issue types');
    }

    const result = await runFullScan({
      types: body.types,
      limit: body.limit ?? 100,
    });

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        action: 'DATA_QUALITY_SCAN',
        entityType: 'SYSTEM',
        newData: {
          totalIssues: result.totalIssues,
          byType: result.byType,
          bySeverity: result.bySeverity,
          autoFixable: result.autoFixable,
          needsReview: result.needsReview,
        } as any,
      },
    });

    return apiSuccess(result);
  } catch (error) {
    console.error('[DataQuality] Scan failed:', error);
    return apiError(
      500,
      'SCAN_FAILED',
      error instanceof Error ? error.message : 'Unknown scan error'
    );
  }
}

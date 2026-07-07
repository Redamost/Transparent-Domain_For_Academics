// ─── Data Quality Issues API ───
// GET — Retrieve issue history from audit logs and latest scan cache.

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, unauthorized } from '@/lib/api/errors';

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
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    // Get recent data quality audit logs
    const recentLogs = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'DATA_QUALITY_SCAN',
            'AUTO_CLEANUP_GARBAGE',
            'AUTO_CLEANUP_ORPHANS',
            'AUTO_CLEANUP_JUNK_BIO',
            'AUTO_PURGE_RESIDUAL',
            'AUTO_CLEANUP_DEFINITE_JUNK',
            'AUTO_CLEANUP_SUMMARY',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        newData: true,
        createdAt: true,
      },
    });

    // Get quick stats
    const [totalDeactivated, totalOrphaned, lastScan] = await Promise.all([
      prisma.person.count({ where: { isActive: false } }),
      prisma.auditLog.count({
        where: { action: 'AUTO_CLEANUP_ORPHANS' },
      }),
      prisma.auditLog.findFirst({
        where: { action: 'DATA_QUALITY_SCAN' },
        orderBy: { createdAt: 'desc' },
        select: { newData: true, createdAt: true },
      }),
    ]);

    return apiSuccess({
      recentActivity: recentLogs.map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        data: log.newData,
        timestamp: log.createdAt,
      })),
      summary: {
        totalDeactivated,
        totalOrphanCleanups: totalOrphaned,
        lastScan: lastScan ? {
          timestamp: lastScan.createdAt,
          summary: lastScan.newData,
        } : null,
      },
    });
  } catch (error) {
    console.error('[DataQuality] Issues fetch failed:', error);
    return apiError(
      500,
      'ISSUES_FAILED',
      error instanceof Error ? error.message : 'Unknown error fetching issues'
    );
  }
}

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runScheduledScrape, refreshPersonData } from '@/lib/scraping/scheduler';
import { countSeedData, cleanupSeedData } from '@/lib/scraping/cleanup';
import { apiSuccess, apiError, unauthorized, notFound } from '@/lib/api/errors';

// ─── POST handler for triggering scraping actions ───

/**
 * Check if the request is authenticated via session OR API key.
 */
async function checkAuth(req: NextRequest): Promise<boolean> {
  // Check session-based auth
  const session = await getServerSession(authOptions);
  if (session && (session.user as any).role === 'ADMIN') return true;

  // Check API key auth (for automated scripts / Task Scheduler)
  const apiKey = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const configuredKey = process.env.SCRAPE_API_KEY;
  if (configuredKey && apiKey === configuredKey) return true;

  return false;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  if (!(await checkAuth(req))) {
    return unauthorized('Valid admin session or API key required');
  }

  const { action } = await params;

  switch (action) {
    case 'run':
      return handleRunScrape();

    case 'person':
      return handleRefreshPerson(req);

    case 'cleanup-seed':
      return handleCleanupSeed(req);

    case 'enrich-only':
      return handleRunEnrichmentOnly();

    default:
      return notFound('Scraping action');
  }
}

// ─── GET handler for scraping stats ───

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  if (!(await checkAuth(req))) {
    return unauthorized('Valid admin session or API key required');
  }

  const { action } = await params;

  switch (action) {
    case 'stats':
      return handleGetStats();

    case 'quality':
      return handleGetQuality();

    case 'enrichment-stats':
      return handleGetEnrichmentStats();

    default:
      return notFound('Scraping action');
  }
}

// ─── Action Handlers ───

async function handleRunScrape() {
  try {
    const stats = await runScheduledScrape();
    return apiSuccess({
      message: 'Scheduled scrape completed',
      ...stats,
    });
  } catch (error) {
    console.error('[Scraping API] Scrape run failed:', error);
    return apiError(
      500,
      'SCRAPE_FAILED',
      error instanceof Error ? error.message : 'Unknown scraping error'
    );
  }
}

async function handleRefreshPerson(req: NextRequest) {
  try {
    const body = await req.json();
    const { personId } = body;

    if (!personId || typeof personId !== 'string') {
      return apiError(400, 'VALIDATION_ERROR', 'personId is required');
    }

    // Verify person exists
    const existing = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, nameZh: true, nameEn: true },
    });

    if (!existing) {
      return notFound('Person');
    }

    await refreshPersonData(personId);

    // Return updated person
    const updated = await prisma.person.findUnique({
      where: { id: personId },
    });

    return apiSuccess({
      message: `Refreshed data for ${existing.nameEn || existing.nameZh}`,
      person: updated,
    });
  } catch (error) {
    console.error('[Scraping API] Person refresh failed:', error);
    return apiError(
      500,
      'REFRESH_FAILED',
      error instanceof Error ? error.message : 'Unknown refresh error'
    );
  }
}

async function handleGetStats() {
  try {
    // Get last 5 scheduled scrape audit logs
    const recentScrapes = await prisma.auditLog.findMany({
      where: { action: 'SCHEDULED_SCRAPE' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        newData: true,
        createdAt: true,
      },
    });

    // Count persons with external IDs (indicates real scraped data)
    const [totalPersons, scrapedPersons, stalePersons] = await Promise.all([
      prisma.person.count({ where: { isActive: true } }),
      prisma.person.count({
        where: {
          isActive: true,
          lastScrapedAt: { not: null },
        },
      }),
      prisma.person.count({
        where: {
          isActive: true,
          OR: [
            { lastScrapedAt: null },
            { lastScrapedAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
          ],
        },
      }),
    ]);

    return apiSuccess({
      recentScrapes: recentScrapes.map((log) => ({
        stats: log.newData,
        ranAt: log.createdAt,
      })),
      summary: {
        totalPersons,
        scrapedPersons,
        stalePersons,
        seedOnly: totalPersons - scrapedPersons,
      },
    });
  } catch (error) {
    console.error('[Scraping API] Stats fetch failed:', error);
    return apiError(
      500,
      'STATS_FAILED',
      error instanceof Error ? error.message : 'Unknown error fetching stats'
    );
  }
}

async function handleCleanupSeed(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry-run for safety

    if (dryRun) {
      const counts = await countSeedData();
      return apiSuccess({
        message: 'Dry run — no data was modified. Set dryRun: false to execute.',
        dryRun: true,
        wouldRemove: counts,
      });
    }

    const stats = await cleanupSeedData();
    return apiSuccess({
      message: `Cleaned up seed data: ${stats.deactivated} persons deactivated, ${stats.deleted} records deleted`,
      stats,
    });
  } catch (error) {
    console.error('[Scraping API] Cleanup seed failed:', error);
    return apiError(
      500,
      'CLEANUP_FAILED',
      error instanceof Error ? error.message : 'Unknown cleanup error'
    );
  }
}

async function handleGetQuality() {
  try {
    const total = await prisma.person.count({ where: { isActive: true } });

    const [
      withBio,
      withEmail,
      withDepartment,
      withTitle,
      withHIndex,
      withPubs,
      withResearch,
      withComp,
      withEval,
      seedCount,
      cnUniCount,
      openAlexCount,
    ] = await Promise.all([
      prisma.person.count({ where: { isActive: true, bioZh: { not: null } } }),
      prisma.person.count({ where: { isActive: true, email: { not: null } } }),
      prisma.person.count({ where: { isActive: true, department: { not: null } } }),
      prisma.person.count({ where: { isActive: true, title: { not: null } } }),
      prisma.person.count({ where: { isActive: true, hIndex: { not: null } } }),
      prisma.person.count({ where: { isActive: true, publications: { some: {} } } }),
      prisma.person.count({ where: { isActive: true, researchUpdates: { some: {} } } }),
      prisma.person.count({ where: { isActive: true, competitionUpdates: { some: {} } } }),
      prisma.person.count({ where: { isActive: true, evaluationUpdates: { some: {} } } }),
      prisma.person.count({
        where: { isActive: true, metadata: { path: ['source'], equals: 'seed' } },
      }),
      prisma.person.count({
        where: { isActive: true, metadata: { path: ['source'], equals: 'CN_UNIVERSITY' } },
      }),
      // Count persons enriched by OpenAlex (have hIndex > 0 and CN_UNIVERSITY source)
      prisma.person.count({
        where: { isActive: true, hIndex: { not: null } },
      }),
    ]);

    const totalPubs = await prisma.publication.count();
    const totalResearch = await prisma.researchUpdate.count();
    const totalComp = await prisma.competitionUpdate.count();
    const totalEval = await prisma.evaluationUpdate.count();

    const toPct = (n: number) => total > 0 ? `${(n / total * 100).toFixed(1)}%` : '0%';

    return apiSuccess({
      personCount: total,
      coverage: {
        bio: { count: withBio, pct: toPct(withBio) },
        email: { count: withEmail, pct: toPct(withEmail) },
        department: { count: withDepartment, pct: toPct(withDepartment) },
        title: { count: withTitle, pct: toPct(withTitle) },
        hIndex: { count: withHIndex, pct: toPct(withHIndex) },
      },
      content: {
        publications: { personsWith: withPubs, pct: toPct(withPubs), totalRecords: totalPubs },
        researchUpdates: { personsWith: withResearch, pct: toPct(withResearch), totalRecords: totalResearch },
        competitionUpdates: { personsWith: withComp, pct: toPct(withComp), totalRecords: totalComp },
        evaluationUpdates: { personsWith: withEval, pct: toPct(withEval), totalRecords: totalEval },
      },
      sources: {
        seed: seedCount,
        cnUniversity: cnUniCount,
        openAlexEnriched: openAlexCount,
      },
    });
  } catch (error) {
    console.error('[Scraping API] Quality fetch failed:', error);
    return apiError(
      500,
      'QUALITY_FAILED',
      error instanceof Error ? error.message : 'Unknown quality fetch error'
    );
  }
}

async function handleGetEnrichmentStats() {
  try {
    const [
      totalActive,
      withHIndex,
      withPubs,
      withNameEn,
      needPinyin,
    ] = await Promise.all([
      prisma.person.count({ where: { isActive: true } }),
      prisma.person.count({ where: { isActive: true, hIndex: { not: null } } }),
      prisma.person.count({ where: { isActive: true, publications: { some: {} } } }),
      prisma.person.count({ where: { isActive: true, nameEn: { not: null } } }),
      prisma.person.count({ where: { isActive: true, nameZh: { not: '' }, nameEn: null } }),
    ]);

    // Backlogs: scholars eligible for each enricher
    const [openAlexBacklog, s2Backlog] = await Promise.all([
      prisma.person.count({
        where: { isActive: true, hIndex: null, nameEn: { not: null }, institution: { not: null } },
      }),
      prisma.person.count({
        where: { isActive: true, hIndex: null, institution: { not: null } },
      }),
    ]);

    const totalPublications = await prisma.publication.count();

    // Recent enrichment runs
    const recentRuns = await prisma.auditLog.findMany({
      where: {
        action: { in: ['OPENALEX_ENRICHMENT', 'SEMANTIC_SCHOLAR_ENRICHMENT', 'GOOGLE_SCHOLAR_ENRICHMENT'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { action: true, newData: true, createdAt: true },
    });

    const toPct = (n: number) => totalActive > 0 ? `${(n / totalActive * 100).toFixed(1)}%` : '0%';

    return apiSuccess({
      coverage: {
        total: totalActive,
        withHIndex: { count: withHIndex, pct: toPct(withHIndex) },
        withPublications: { count: withPubs, pct: toPct(withPubs) },
        withNameEn: { count: withNameEn, pct: toPct(withNameEn) },
        totalPublications,
      },
      backlog: {
        pinyinBacklog: needPinyin,
        openAlexBacklog: openAlexBacklog,
        semanticScholarBacklog: s2Backlog,
      },
      recentEnrichmentRuns: recentRuns.map((r) => ({
        action: r.action,
        stats: r.newData,
        at: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Scraping API] Enrichment stats fetch failed:', error);
    return apiError(
      500,
      'ENRICHMENT_STATS_FAILED',
      error instanceof Error ? error.message : 'Unknown error fetching enrichment stats'
    );
  }
}

async function handleRunEnrichmentOnly() {
  try {
    const { enrichOpenAlexWithS2Fallback, enrichGoogleScholar, enrichSemanticScholar } =
      await import('@/lib/scraping/scheduler');

    const results = await Promise.allSettled([
      enrichOpenAlexWithS2Fallback(200),
      enrichGoogleScholar(30),
      enrichSemanticScholar(80),
    ]);

    const formatted = results.map((r, i) => {
      const names = ['OpenAlex+S2', 'Google Scholar', 'Semantic Scholar'];
      if (r.status === 'fulfilled') {
        return { name: names[i], status: 'success' };
      }
      return {
        name: names[i],
        status: 'error',
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });

    return apiSuccess({
      message: 'Enrichment-only run completed',
      results: formatted,
    });
  } catch (error) {
    console.error('[Scraping API] Enrichment-only run failed:', error);
    return apiError(
      500,
      'ENRICHMENT_FAILED',
      error instanceof Error ? error.message : 'Unknown enrichment error'
    );
  }
}

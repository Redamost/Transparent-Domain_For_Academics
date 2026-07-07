// ─── CN University Scraping Scheduler ───
// Manages periodic scraping of Chinese university faculty profile pages.
// This is the ONLY scraping source — university faculty lists are authoritative
// and naturally limit results to verified Chinese scholars.
//
// Flow:
//   1. Select N universities via rotating window
//   2. For each: crawl faculty lists → discover profile links → parse profiles
//   3. Validate names → normalize → dedup against DB → insert or update
//   4. Log stats and audit entry

import { prisma } from '@/lib/prisma';
import type { ScrapedPerson, ScrapeTask, ScrapeStats } from './types';
import { scrapeUniversities, getSupportedUniversities, fetchAndParseProfile } from './cn-university';
import type { UniversityScrapeStats } from './cn-university';
import { mergePersonSources } from './normalizer';
import { deduplicatePerson } from './deduplicator';
import { isValidScrapedPerson } from './name-validator';
import { initializeScoreBreakdowns } from '@/lib/rating/calculator';
import { batchEnrichFromOpenAlex, getOpenAlexBacklog } from './openalex-enricher';
import { backfillPinyinNames, getPinyinBacklog } from './pinyin-backfill';
import { inferFields, normalizeResearchText } from './field-inference';
import { metrics } from './metrics';

// ─── Configuration ───

const CONFIG = {
  /** Universities to process per scheduler run */
  UNIVERSITIES_PER_RUN: 5,
  /** Maximum profiles to scrape per university per run */
  MAX_PROFILES_PER_UNIVERSITY: 100,
  /** Minimum days between profile updates for stale refresh */
  PROFILE_UPDATE_INTERVAL_DAYS: 14,
  /** Days between full citation analysis runs */
  CITATION_ANALYSIS_INTERVAL_DAYS: 7,
  /** Maximum stale profiles to update per run */
  MAX_STALE_UPDATES: 20,
  /** Maximum OpenAlex enrichments per run (rate-limited free API) */
  MAX_OPENALEX_ENRICHMENTS: 200,
  /** Maximum Google Scholar enrichments per run (now with concurrent scraping, reduced delay) */
  MAX_SCHOLAR_ENRICHMENTS: 30,
  /** Maximum Semantic Scholar enrichments per run (free API: 100/5min) */
  MAX_SEMANTIC_SCHOLAR_ENRICHMENTS: 80,
  /** Run arXiv sync every N scheduler runs */
  ARXIV_SYNC_INTERVAL_RUNS: 3,
  /** Maximum arXiv sync persons per run */
  MAX_ARXIV_SYNC_PERSONS: 30,
};

// ─── University Circuit Breaker ───

interface UniFailureState {
  consecutiveFailures: number;
  lastFailureAt: Date;
  trippedUntil: Date | null;
}

/** In-memory circuit breaker for university-level scraping failures */
const uniCircuitBreaker = new Map<string, UniFailureState>();

/** Consecutive failures before tripping the circuit breaker */
const CB_MAX_FAILURES = 3;
/** Minutes to skip a university after breaker trips */
const CB_TRIP_MINUTES = 30;

function isCircuitBroken(key: string): boolean {
  const state = uniCircuitBreaker.get(key);
  if (!state || !state.trippedUntil) return false;
  if (new Date() > state.trippedUntil) {
    // Cool-down expired — allow retry
    uniCircuitBreaker.set(key, { ...state, trippedUntil: null, consecutiveFailures: 0 });
    return false;
  }
  return true;
}

function recordUniSuccess(key: string): void {
  uniCircuitBreaker.delete(key);
}

function recordUniFailure(key: string): void {
  const state = uniCircuitBreaker.get(key) || {
    consecutiveFailures: 0,
    lastFailureAt: new Date(),
    trippedUntil: null,
  };
  state.consecutiveFailures++;
  state.lastFailureAt = new Date();
  if (state.consecutiveFailures >= CB_MAX_FAILURES) {
    state.trippedUntil = new Date(Date.now() + CB_TRIP_MINUTES * 60 * 1000);
    console.log(
      `[Scheduler] 🔴 Circuit breaker TRIPPED for ${key} — ${state.consecutiveFailures} consecutive failures, skipping for ${CB_TRIP_MINUTES}min`,
    );
  }
  uniCircuitBreaker.set(key, state);
}

// ─── Source Toggle ───

function isScrapingDisabled(): boolean {
  if (process.env.SCRAPE_SKIP_CN_UNIVERSITY === 'true') {
    console.log('[Scheduler] CN University scraping is disabled (SCRAPE_SKIP_CN_UNIVERSITY=true)');
    return true;
  }
  return false;
}

// ─── Scrape Progress Tracking ───

interface ScrapeProgress {
  /** Run identifier (same as AuditLog entry for this run) */
  runId: string;
  /** Overall status */
  status: 'in_progress' | 'completed' | 'failed';
  /** Universities processed so far in this run */
  universitiesCompleted: string[];
  /** Current university being scraped (if any) */
  currentUniversity: string | null;
  /** Profiles scraped so far (across all universities in this run) */
  profilesScraped: number;
  /** Profiles persisted (inserted + updated) */
  profilesPersisted: number;
  /** Phase: scraping | enriching | stale | analysis */
  phase: string;
  /** Timestamp when the run started */
  startedAt: string;
  /** Timestamp of last checkpoint */
  lastCheckpointAt: string;
}

const PROGRESS_ACTION = 'SCRAPE_PROGRESS';

async function saveRunProgress(progress: ScrapeProgress): Promise<void> {
  progress.lastCheckpointAt = new Date().toISOString();
  try {
    await prisma.auditLog.create({
      data: {
        action: PROGRESS_ACTION,
        entityType: 'SYSTEM',
        entityId: progress.runId,
        newData: JSON.parse(JSON.stringify(progress)),
      },
    });
  } catch (err) {
    console.error('[Scheduler] Failed to save progress checkpoint:', err);
  }
}

async function loadIncompleteRun(): Promise<ScrapeProgress | null> {
  try {
    const lastProgress = await prisma.auditLog.findFirst({
      where: {
        action: PROGRESS_ACTION,
        entityType: 'SYSTEM',
      },
      orderBy: { createdAt: 'desc' },
      select: { newData: true },
    });

    if (!lastProgress?.newData) return null;

    const progress = lastProgress.newData as unknown as ScrapeProgress;
    if (progress.status === 'in_progress') {
      // Check it hasn't been stale too long (>2 hours = abandoned)
      const age = Date.now() - new Date(progress.lastCheckpointAt).getTime();
      if (age > 2 * 60 * 60 * 1000) {
        console.log(`[Scheduler] Previous run ${progress.runId} is stale (>2h), starting fresh`);
        return null;
      }
      return progress;
    }
    return null;
  } catch (err) {
    console.error('[Scheduler] Failed to load previous progress:', err);
    return null;
  }
}

async function markRunCompleted(runId: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: PROGRESS_ACTION,
        entityType: 'SYSTEM',
        entityId: runId,
        newData: {
          runId,
          status: 'completed',
          lastCheckpointAt: new Date().toISOString(),
        },
      },
    });
  } catch {
    // Non-critical
  }
}

// ─── Task Management ───

export async function queueTask(
  type: ScrapeTask['type'],
  priority: number,
  params: Record<string, unknown>,
): Promise<ScrapeTask> {
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    priority,
    params,
    status: 'QUEUED',
    error: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    retryCount: 0,
  };
}

// ─── Enrichment Helpers ───

export async function enrichOpenAlex(maxEnrichments: number): Promise<void> {
  const backlog = await getOpenAlexBacklog();
  console.log(
    `[Scheduler] OpenAlex backlog: ${backlog.remaining} remaining / ${backlog.totalEligible} eligible`,
  );
  if (backlog.remaining > 0) {
    const stats = await batchEnrichFromOpenAlex(maxEnrichments);
    console.log(
      `[Scheduler] OpenAlex enriched: ${stats.totalMatched}/${stats.totalProcessed} matched, ${stats.totalPapersImported} papers`,
    );
  }
}

export async function enrichGoogleScholar(maxEnrichments: number): Promise<void> {
  const { selectScholarCandidates, batchEnrichFromScholar } = await import('./scholar-enricher');
  const gsCandidates = await selectScholarCandidates(maxEnrichments);
  if (gsCandidates.length === 0) {
    console.log('[Scheduler] Google Scholar: no eligible candidates (need nameEn + institution + no hIndex)');
    return;
  }

  console.log(`[Scheduler] Google Scholar: processing ${gsCandidates.length} candidates with concurrent scraping...`);

  const { batchScrapeScholars, closeBrowser } = await import('./google-scholar');

  try {
    // Use concurrent batch scraping (3 workers sharing browser context)
    const profileMap = await batchScrapeScholars(
      gsCandidates.map((c) => ({
        nameZh: c.nameZh,
        nameEn: c.nameEn!,
        institution: c.institution!,
      })),
      { maxConcurrency: 3 },
    );

    // Map profiles back to person IDs
    const enrichmentMap = new Map<string, import('./google-scholar').ScholarProfile>();
    for (const candidate of gsCandidates) {
      const key = `${candidate.nameEn}|${candidate.institution}`;
      const profile = profileMap.get(key);
      if (profile) {
        enrichmentMap.set(candidate.id, profile);
      }
    }

    if (enrichmentMap.size > 0) {
      const gsStats = await batchEnrichFromScholar(enrichmentMap);
      console.log(
        `[Scheduler] Google Scholar enriched: ${gsStats.totalMatched}/${gsStats.totalProcessed} matched, ` +
        `${gsStats.totalPapersImported} papers, ${gsStats.totalNamesUpdated} names updated`,
      );
    } else {
      console.log('[Scheduler] Google Scholar: no profiles found in this batch');
    }
  } finally {
    await closeBrowser();
  }
}

export async function enrichSemanticScholar(maxEnrichments: number): Promise<void> {
  const { batchEnrichFromS2, getBacklog } = await import('./semantic-scholar-enricher');
  const backlog = await getBacklog();
  console.log(
    `[Scheduler] Semantic Scholar backlog: ${backlog.remaining} remaining / ${backlog.totalEligible} eligible`,
  );
  if (backlog.remaining > 0) {
    const stats = await batchEnrichFromS2(maxEnrichments);
    console.log(
      `[Scheduler] Semantic Scholar enriched: ${stats.totalMatched}/${stats.totalProcessed} matched, ${stats.totalPapersImported} papers`,
    );
  }
}

/**
 * OpenAlex enrichment with Semantic Scholar DOI fallback.
 * Implements the slr-ranking multi-API fallback pattern:
 * 1. Run OpenAlex enrichment normally
 * 2. For scholars that didn't match: check if they have scraped publications with DOIs
 * 3. For those with DOIs: try S2 paper search → get authorId → re-query OpenAlex
 */
export async function enrichOpenAlexWithS2Fallback(maxEnrichments: number): Promise<void> {
  const oaStats = await batchEnrichFromOpenAlex(maxEnrichments);
  const unmatchedIds = oaStats.results
    .filter((r) => !r.matched)
    .map((r) => r.personId);

  if (unmatchedIds.length === 0) return;

  // Find unmatched scholars who have scraped publications with DOIs
  const scholarsWithDois = await prisma.person.findMany({
    where: {
      id: { in: unmatchedIds },
      isActive: true,
      publications: { some: { doi: { not: null } } },
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      publications: {
        select: { doi: true },
        where: { doi: { not: null } },
        take: 5,
      },
    },
    take: 10, // Limit fallback attempts per run
  });

  if (scholarsWithDois.length === 0) return;

  console.log(
    `[Scheduler] Enrichment fallback: ${scholarsWithDois.length} unmatched scholars have DOIs, trying S2 DOI → OpenAlex...`,
  );

  const { findAuthorByDoi } = await import('./semantic-scholar');
  const { enrichPersonWithOpenAlex } = await import('./openalex-enricher');

  let s2FallbackMatches = 0;
  for (const scholar of scholarsWithDois) {
    let matched = false;
    for (const pub of scholar.publications.slice(0, 3)) {
      if (!pub.doi) continue;
      try {
        const s2Author = await findAuthorByDoi(pub.doi, scholar.nameEn || scholar.nameZh);
        if (s2Author) {
          const result = await enrichPersonWithOpenAlex(
            scholar.id,
            scholar.nameZh,
            scholar.institution,
            s2Author.name,
          );
          if (result.matched) {
            s2FallbackMatches++;
            matched = true;
            console.log(
              `  [Scheduler] Fallback OK: ${scholar.nameZh} matched via S2 DOI (${pub.doi.slice(0, 30)}...) → OA author`,
            );
            break;
          }
        }
      } catch {
        // Continue to next DOI
      }
    }
    if (!matched) {
      console.log(`  [Scheduler] Fallback miss: ${scholar.nameZh} — no match via S2 DOI`);
    }
  }

  console.log(
    `[Scheduler] Enrichment fallback complete: ${s2FallbackMatches}/${scholarsWithDois.length} matched via S2 DOI`,
  );
}

// ─── Main Scheduled Run ───

export async function runScheduledScrape(): Promise<ScrapeStats> {
  const startTime = Date.now();
  let totalScraped = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let errors = 0;

  console.log('[Scheduler] ===== Starting CN University scrape =====');

  if (isScrapingDisabled()) {
    console.log('[Scheduler] Scraping disabled — skipping.');
    return {
      totalScraped: 0,
      totalNormalized: 0,
      totalDeduped: 0,
      totalInserted: 0,
      totalUpdated: 0,
      errors: 0,
      lastRunAt: new Date(),
      duration: Date.now() - startTime,
    };
  }

  // 0. Check for incomplete previous run and prepare progress tracking
  const incompleteRun = await loadIncompleteRun();
  const runId = incompleteRun?.runId || `run_${Date.now()}`;
  let progress: ScrapeProgress = incompleteRun || {
    runId,
    status: 'in_progress',
    universitiesCompleted: [],
    currentUniversity: null,
    profilesScraped: 0,
    profilesPersisted: 0,
    phase: 'starting',
    startedAt: new Date().toISOString(),
    lastCheckpointAt: new Date().toISOString(),
  };

  if (incompleteRun) {
    console.log(
      `[Scheduler] Resuming incomplete run ${runId} — ${incompleteRun.universitiesCompleted.length} universities already done, ${incompleteRun.profilesPersisted} profiles persisted`,
    );
  }

  await saveRunProgress({ ...progress, phase: 'scraping' });

  // 1. Select universities for this run via rotating window (skip tripped breakers)
  const allUniversities = getSupportedUniversities();
  const runIndex = await getRunCount();
  const startIdx = (runIndex * CONFIG.UNIVERSITIES_PER_RUN) % allUniversities.length;

  // Collect candidates, rotating through the list
  // If resuming, skip universities already completed in the previous partial run
  const completedSet = new Set(progress.universitiesCompleted);
  const candidates: string[] = [];
  for (let i = 0; i < allUniversities.length && candidates.length < CONFIG.UNIVERSITIES_PER_RUN; i++) {
    const idx = (startIdx + i) % allUniversities.length;
    const key = allUniversities[idx].key;
    if (isCircuitBroken(key)) {
      const state = uniCircuitBreaker.get(key)!;
      console.log(
        `[Scheduler] ⏭ Skipping ${key} — circuit breaker tripped until ${state.trippedUntil!.toISOString().slice(0, 19)} (${state.consecutiveFailures} failures)`,
      );
      continue;
    }
    if (completedSet.has(key)) {
      console.log(`[Scheduler] ⏭ Skipping ${key} — already completed in resumed run ${runId}`);
      continue;
    }
    if (!candidates.includes(key)) candidates.push(key);
  }

  const batchKeys = candidates;

  // Log any tripped universities
  const trippedCount = [...uniCircuitBreaker.values()].filter(
    (s) => s.trippedUntil && new Date() <= s.trippedUntil,
  ).length;
  if (trippedCount > 0) {
    console.log(`[Scheduler] ⚠ ${trippedCount} universities currently tripped by circuit breaker`);
  }

  console.log(
    `[Scheduler] Run #${runIndex}: processing ${batchKeys.length} universities: ${batchKeys.join(', ')}`,
  );
  console.log(
    `[Scheduler] Total ${allUniversities.length} universities, rotating ${CONFIG.UNIVERSITIES_PER_RUN} per run`,
  );

  // 2. Scrape each university
  let scrapeStats: UniversityScrapeStats[] = [];
  try {
    const result = await scrapeUniversities(
      batchKeys,
      CONFIG.MAX_PROFILES_PER_UNIVERSITY,
    );
    const allProfiles = result.profiles;
    scrapeStats = result.stats;
    totalScraped = allProfiles.length;
    console.log(`[Scheduler] Scraped ${totalScraped} total profiles`);

    // Log per-university stats and update circuit breaker
    for (const us of scrapeStats) {
      console.log(
        `[Scheduler] ${us.key}: ${us.profilesParsed}/${us.profileLinksDiscovered} links parsed, ` +
        `${us.profilesFailed} failed, ${us.listUrlsSucceeded}/${us.listUrlsAttempted} list pages OK (${(us.durationMs / 1000).toFixed(1)}s)`,
      );
      // Circuit breaker: record failure if no list pages succeeded AND no profiles parsed
      if (us.listUrlsSucceeded === 0 && us.profilesParsed === 0) {
        recordUniFailure(us.key);
      } else {
        recordUniSuccess(us.key);
      }
    }

    // 3. Validate, normalize, dedup, and persist each profile
    for (const profile of allProfiles) {
      try {
        // Name validation gate
        const nameCheck = isValidScrapedPerson({
          nameZh: profile.nameZh,
          nameEn: profile.nameEn,
          institution: profile.institution,
        });
        if (!nameCheck.valid) {
          console.warn(`[Scheduler] REJECTED garbage profile: ${nameCheck.reason}`);
          continue;
        }

        // Normalize (single-source merge — trivial since only CN_UNIVERSITY)
        const normalized = mergePersonSources([profile]);

        // Dedup against DB
        const dedupResult = await deduplicatePerson(normalized);

        if (dedupResult.matched && dedupResult.existingPersonId) {
          await updateExistingPerson(dedupResult.existingPersonId, profile);
          totalUpdated++;
        } else {
          await insertNewPerson(profile);
          totalInserted++;
        }
        progress.profilesPersisted = totalInserted + totalUpdated;
      } catch (err) {
        console.error(
          `[Scheduler] Error processing profile "${profile.nameZh}":`,
          err,
        );
        errors++;
      }
    }

    // Checkpoint after scraping phase
    progress.universitiesCompleted = batchKeys;
    progress.profilesScraped = totalScraped;
    progress.phase = 'scraping_complete';
    await saveRunProgress(progress);
  } catch (err) {
    console.error('[Scheduler] Error during university scraping:', err);
    errors++;
  }

  // 4. Update stale profiles (refresh metrics for existing persons)
  try {
    const staleUpdated = await updateStaleProfiles();
    totalUpdated += staleUpdated;
  } catch (err) {
    console.error('[Scheduler] Error updating stale profiles:', err);
    errors++;
  }

  // 4.5. Pinyin backfill: generate nameEn for scholars missing it (prerequisite for enrichment matching)
  try {
    const pinyinBacklog = await getPinyinBacklog();
    if (pinyinBacklog.totalWithoutNameEn > 0) {
      const pinyinStats = await backfillPinyinNames(500);
      console.log(
        `[Scheduler] Pinyin backfill: ${pinyinStats.updated} names generated, ${pinyinStats.skipped} skipped (${pinyinBacklog.totalWithoutNameEn} remaining)`,
      );
    }
  } catch (err) {
    console.error('[Scheduler] Error in pinyin backfill:', err);
    errors++;
  }

  // 5. Enrich persons: run OpenAlex (with S2 fallback), Google Scholar, and S2 ALL in parallel
  try {
    const enrichResults = await Promise.allSettled([
      enrichOpenAlexWithS2Fallback(CONFIG.MAX_OPENALEX_ENRICHMENTS),
      enrichGoogleScholar(CONFIG.MAX_SCHOLAR_ENRICHMENTS),
      enrichSemanticScholar(CONFIG.MAX_SEMANTIC_SCHOLAR_ENRICHMENTS),
    ]);

    for (const result of enrichResults) {
      if (result.status === 'rejected') {
        console.error('[Scheduler] Enrichment task failed:', result.reason);
        errors++;
      }
    }

    // Checkpoint after enrichment
    progress.phase = 'enrichment_complete';
    await saveRunProgress(progress);
  } catch (err) {
    console.error('[Scheduler] Error during enrichment phase:', err);
    errors++;
  }

  // 4.6. Sync arXiv papers for recently enriched scholars (periodic)
  try {
    if (runIndex % CONFIG.ARXIV_SYNC_INTERVAL_RUNS === 0) {
      console.log('[Scheduler] Running arXiv sync (every N runs)...');
      const { syncArxivToResearchUpdates } = await import('../feed/enricher');
      // Sync arXiv for persons who have English names AND hIndex (likely real scholars)
      const arxivCandidates = await prisma.person.findMany({
        where: {
          isActive: true,
          nameEn: { not: null },
          hIndex: { not: null },
        },
        select: { id: true },
        take: CONFIG.MAX_ARXIV_SYNC_PERSONS,
        orderBy: { lastScrapedAt: 'desc' },
      });

      let arxivSynced = 0;
      for (const person of arxivCandidates) {
        try {
          const synced = await syncArxivToResearchUpdates(person.id, 3);
          arxivSynced += synced;
        } catch {
          // skip individual failures
        }
      }
      if (arxivSynced > 0) {
        console.log(`[Scheduler] arXiv synced: ${arxivSynced} papers for ${arxivCandidates.length} scholars`);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error during arXiv sync:', err);
    errors++;
  }

  // 5. Run citation analysis (periodically)
  try {
    const lastAnalysis = await getLastCitationAnalysisDate();
    const daysSinceAnalysis = lastAnalysis
      ? Math.floor((Date.now() - lastAnalysis.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceAnalysis >= CONFIG.CITATION_ANALYSIS_INTERVAL_DAYS) {
      const { analyzeFieldPowerStructure, persistAuthorityScores } =
        await import('./citation-network');
      const topFields = await prisma.field.findMany({
        orderBy: { persons: { _count: 'desc' } },
        take: 5,
      });
      for (const field of topFields) {
        const results = await analyzeFieldPowerStructure(field.slug);
        await persistAuthorityScores(results);
        console.log(
          `[Scheduler] Citation analysis for "${field.nameEn}": ${results.totalNodes} nodes`,
        );
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error running citation analysis:', err);
    errors++;
  }

  const duration = Date.now() - startTime;

  const stats: ScrapeStats = {
    totalScraped,
    totalNormalized: totalScraped,
    totalDeduped: totalInserted + totalUpdated,
    totalInserted,
    totalUpdated,
    errors,
    lastRunAt: new Date(),
    duration,
  };

  // Log audit entry
  await prisma.auditLog.create({
    data: {
      action: 'SCHEDULED_SCRAPE',
      entityType: 'SYSTEM',
      newData: {
        ...JSON.parse(JSON.stringify(stats)),
        universityStats: scrapeStats.map((s) => ({
          key: s.key,
          nameZh: s.nameZh,
          profilesParsed: s.profilesParsed,
          profilesFailed: s.profilesFailed,
          linksDiscovered: s.profileLinksDiscovered,
          durationMs: s.durationMs,
        })),
      },
    },
  });

  // Mark progress run as completed
  await markRunCompleted(runId);

  // ── Metrics summary ──
  const snap = metrics.snapshot();
  console.log('[Scheduler] ===== Scrape completed =====');
  console.log(
    `[Scheduler] Stats: scraped=${totalScraped} inserted=${totalInserted} updated=${totalUpdated} errors=${errors} duration=${(duration / 1000).toFixed(1)}s`,
  );
  console.log(
    `[Scheduler] Metrics: ${snap.requests.total} reqs (${snap.requests.succeeded} OK/${snap.requests.failed} FAIL), ` +
    `cache ${snap.requests.cacheHits} hits/${snap.requests.cacheMisses} misses, ` +
    `${snap.requests.dedupSkips} dedup skips`,
  );
  if (snap.latency.samples > 0) {
    console.log(
      `[Scheduler] Latency: p50=${snap.latency.p50Ms}ms p95=${snap.latency.p95Ms}ms p99=${snap.latency.p99Ms}ms (${snap.latency.samples} samples)`,
    );
  }

  // Persist metrics to AuditLog
  try {
    await prisma.auditLog.create({
      data: {
        action: 'SCRAPE_METRICS',
        entityType: 'SYSTEM',
        newData: JSON.parse(JSON.stringify(snap)),
      },
    });
  } catch {
    // Non-critical
  }

  return stats;
}

// ─── Database Persistence ───

async function insertNewPerson(profile: ScrapedPerson): Promise<void> {
  const normalized = mergePersonSources([profile]);

  // Name validation gate (final check)
  const nameCheck = isValidScrapedPerson({
    nameZh: normalized.nameZh,
    nameEn: normalized.nameEn,
    institution: normalized.institution,
  });
  if (!nameCheck.valid) {
    console.warn(`[Scheduler] REJECTED at insert: ${nameCheck.reason}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.person.create({
      data: {
        nameZh: normalized.nameZh || profile.nameZh || 'Unknown',
        nameEn: normalized.nameEn,
        alternativeNames:
          normalized.alternativeNames.length > 0
            ? JSON.stringify(normalized.alternativeNames)
            : null,
        title: normalized.title,
        institution: normalized.institution,
        department: normalized.department,
        email: normalized.email,
        website: normalized.website,
        avatarUrl: normalized.avatarUrl,
        bioZh: normalized.bio,
        hIndex: null,
        citationCount: null,
        publicationCount: normalized.publicationCount,
        lastScrapedAt: new Date(),
        isVerified: false,
        metadata: JSON.parse(
          JSON.stringify({
            source: 'CN_UNIVERSITY',
            confidence: 0.6,
            scrapedAt: new Date().toISOString(),
            ...normalized.metadata,
          }),
        ),
      },
    });

    // Initialize score breakdowns
    await initializeScoreBreakdowns(tx, created.id);

    // Create publications
    if (normalized.publications.length > 0) {
      await tx.publication.createMany({
        data: normalized.publications.slice(0, 100).map((pub) => ({
          personId: created.id,
          title: pub.title,
          authors: pub.authors.join('; '),
          journal: pub.journal,
          year: pub.year,
          doi: pub.doi,
          url: pub.url,
          citationCount: pub.citationCount,
          abstract: pub.abstract,
          source: 'SCRAPER',
          publishedAt: pub.publishedAt ? new Date(pub.publishedAt) : null,
        })),
        skipDuplicates: true,
      });
    }

    // Create research updates
    if (normalized.researchUpdates.length > 0) {
      await tx.researchUpdate.createMany({
        data: normalized.researchUpdates.slice(0, 30).map((update) => ({
          personId: created.id,
          title: update.title,
          description: update.description,
          url: update.url,
          source: update.source,
          publishedAt: update.publishedAt
            ? new Date(update.publishedAt)
            : null,
        })),
      });
    }

    // Create competition updates
    if (normalized.competitionUpdates.length > 0) {
      await tx.competitionUpdate.createMany({
        data: normalized.competitionUpdates.slice(0, 20).map((item) => ({
          personId: created.id,
          title: item.title,
          description: item.description,
          url: item.url,
          source: item.source,
          level: item.level,
          award: item.award,
          publishedAt: item.publishedAt
            ? new Date(item.publishedAt)
            : null,
        })),
      });
    }

    // Create evaluation updates
    if (normalized.evaluationUpdates.length > 0) {
      await tx.evaluationUpdate.createMany({
        data: normalized.evaluationUpdates.slice(0, 20).map((item) => ({
          personId: created.id,
          title: item.title,
          description: item.description,
          url: item.url,
          source: item.source,
          evalType: item.evalType,
          result: item.result,
          publishedAt: item.publishedAt
            ? new Date(item.publishedAt)
            : null,
        })),
      });
    }

    // ── Infer and assign research fields ──
    try {
      const researchText = normalizeResearchText(
        normalized.researchUpdates.map((u) => ({ title: u.title, description: u.description })),
      );
      const inferredSlugs = inferFields({
        researchText,
        department: normalized.department,
        bio: normalized.bio,
        publications: normalized.publications.map((p) => ({ title: p.title })),
        institution: normalized.institution,
        sourceUrl: profile.sourceUrl,
      });

      if (inferredSlugs.length > 0) {
        // Look up field IDs from slugs
        const fieldRecords = await tx.field.findMany({
          where: { slug: { in: inferredSlugs } },
          select: { id: true, slug: true },
        });

        if (fieldRecords.length > 0) {
          await tx.personField.createMany({
            data: fieldRecords.map((f, i) => ({
              personId: created.id,
              fieldId: f.id,
              isPrimary: i === 0, // highest-confidence field is primary
            })),
            skipDuplicates: true,
          });
          console.log(
            `[Scheduler]   ↳ Assigned ${fieldRecords.length} fields: ${fieldRecords.map((f) => f.slug).join(', ')}`,
          );
        }
      }
    } catch (fieldErr) {
      // Field inference should never block person creation
      console.warn(`[Scheduler]   ↳ Field inference failed for ${profile.nameZh}:`, fieldErr);
    }

    console.log(
      `[Scheduler] Inserted: ${profile.nameZh} (${created.id}) [${normalized.publications.length} pubs, ${normalized.researchUpdates.length} research, ${normalized.competitionUpdates.length} comp, ${normalized.evaluationUpdates.length} eval]`,
    );
  });
}

async function updateExistingPerson(
  existingId: string,
  profile: ScrapedPerson,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.person.findUnique({
      where: { id: existingId },
      select: { email: true, metadata: true },
    });

    await tx.person.update({
      where: { id: existingId },
      data: {
        institution: profile.institution || undefined,
        email: profile.email || existing?.email || undefined,
        department: profile.department || undefined,
        website: profile.website || undefined,
        bioZh: profile.bio || undefined,
        lastScrapedAt: new Date(),
        metadata: {
          ...((existing?.metadata as any) || {}),
          lastUpdated: new Date().toISOString(),
        },
      },
    });

    // Add new publications (DOI-based — batch create + update in two passes)
    if (profile.publications.length > 0) {
      const pubsWithDoi = profile.publications
        .slice(0, 50)
        .filter((p) => !!p.doi);
      if (pubsWithDoi.length > 0) {
        // Fetch existing DOIs in one query
        const dois = pubsWithDoi.map((p) => p.doi!);
        const existingPubs = await tx.publication.findMany({
          where: { doi: { in: dois } },
          select: { doi: true },
        });
        const existingDois = new Set(existingPubs.map((p) => p.doi));

        // Separate into creates vs updates
        const toCreate = pubsWithDoi.filter((p) => !existingDois.has(p.doi!));
        const toUpdate = pubsWithDoi.filter((p) => existingDois.has(p.doi!));

        // Bulk create new publications
        if (toCreate.length > 0) {
          await tx.publication.createMany({
            data: toCreate.map((pub) => ({
              personId: existingId,
              title: pub.title,
              authors: pub.authors.join('; '),
              journal: pub.journal,
              year: pub.year,
              doi: pub.doi!,
              url: pub.url,
              citationCount: pub.citationCount,
              abstract: pub.abstract,
              source: 'SCRAPER',
              publishedAt: pub.publishedAt ? new Date(pub.publishedAt) : null,
            })),
            skipDuplicates: true,
          });
        }

        // Bulk update citation counts for existing publications
        for (const pub of toUpdate) {
          if (pub.citationCount !== null && pub.citationCount !== undefined) {
            await tx.publication.updateMany({
              where: { doi: pub.doi! },
              data: {
                citationCount: pub.citationCount,
                abstract: pub.abstract ?? undefined,
              },
            });
          }
        }
      }
    }

    // Add new research updates (skip duplicates by title)
    if (profile.researchUpdates.length > 0) {
      const existingUpdates = await tx.researchUpdate.findMany({
        where: { personId: existingId },
        select: { title: true },
      });
      const existingTitles = new Set(
        existingUpdates.map((u) => u.title.toLowerCase().substring(0, 60)),
      );
      const newUpdates = profile.researchUpdates.filter(
        (u) => !existingTitles.has(u.title.toLowerCase().substring(0, 60)),
      );
      if (newUpdates.length > 0) {
        await tx.researchUpdate.createMany({
          data: newUpdates.slice(0, 20).map((update) => ({
            personId: existingId,
            title: update.title,
            description: update.description,
            url: update.url,
            source: update.source,
            publishedAt: update.publishedAt
              ? new Date(update.publishedAt)
              : null,
          })),
        });
      }
    }

    // Add new competition updates
    if (profile.competitionUpdates.length > 0) {
      const existingComp = await tx.competitionUpdate.findMany({
        where: { personId: existingId },
        select: { title: true },
      });
      const existingCompTitles = new Set(
        existingComp.map((u) => u.title.toLowerCase().substring(0, 60)),
      );
      const newComp = profile.competitionUpdates.filter(
        (u) => !existingCompTitles.has(u.title.toLowerCase().substring(0, 60)),
      );
      if (newComp.length > 0) {
        await tx.competitionUpdate.createMany({
          data: newComp.slice(0, 20).map((item) => ({
            personId: existingId,
            title: item.title,
            description: item.description,
            url: item.url,
            source: item.source,
            level: item.level,
            award: item.award,
            publishedAt: item.publishedAt
              ? new Date(item.publishedAt)
              : null,
          })),
        });
      }
    }

    // Add new evaluation updates
    if (profile.evaluationUpdates.length > 0) {
      const existingEval = await tx.evaluationUpdate.findMany({
        where: { personId: existingId },
        select: { title: true },
      });
      const existingEvalTitles = new Set(
        existingEval.map((u) => u.title.toLowerCase().substring(0, 60)),
      );
      const newEval = profile.evaluationUpdates.filter(
        (u) => !existingEvalTitles.has(u.title.toLowerCase().substring(0, 60)),
      );
      if (newEval.length > 0) {
        await tx.evaluationUpdate.createMany({
          data: newEval.slice(0, 20).map((item) => ({
            personId: existingId,
            title: item.title,
            description: item.description,
            url: item.url,
            source: item.source,
            evalType: item.evalType,
            result: item.result,
            publishedAt: item.publishedAt
              ? new Date(item.publishedAt)
              : null,
          })),
        });
      }
    }

    // ── Infer and assign research fields if none exist ──
    try {
      const existingFieldCount = await tx.personField.count({
        where: { personId: existingId },
      });

      if (existingFieldCount === 0) {
        const normalized = mergePersonSources([profile]);
        const researchText = normalizeResearchText(
          normalized.researchUpdates.map((u) => ({ title: u.title, description: u.description })),
        );
        const inferredSlugs = inferFields({
          researchText,
          department: normalized.department,
          bio: normalized.bio,
          publications: normalized.publications.map((p) => ({ title: p.title })),
          institution: normalized.institution,
          sourceUrl: profile.sourceUrl,
        });

        if (inferredSlugs.length > 0) {
          const fieldRecords = await tx.field.findMany({
            where: { slug: { in: inferredSlugs } },
            select: { id: true, slug: true },
          });

          if (fieldRecords.length > 0) {
            await tx.personField.createMany({
              data: fieldRecords.map((f, i) => ({
                personId: existingId,
                fieldId: f.id,
                isPrimary: i === 0,
              })),
              skipDuplicates: true,
            });
            console.log(
              `[Scheduler]   ↳ Assigned ${fieldRecords.length} fields: ${fieldRecords.map((f) => f.slug).join(', ')}`,
            );
          }
        }
      } else {
        // Phase 4: Field re-evaluation when significant new data arrives
        // Re-run field inference if ≥3 new research updates or ≥5 new papers were added
        const totalNewRecords =
          (profile.researchUpdates?.length || 0) +
          (profile.publications?.length || 0);

        if (totalNewRecords >= 5) {
          const normalized = mergePersonSources([profile]);
          const researchText = normalizeResearchText(
            normalized.researchUpdates.map((u) => ({ title: u.title, description: u.description })),
          );
          const newInferredSlugs = inferFields({
            researchText,
            department: normalized.department,
            bio: normalized.bio,
            publications: normalized.publications.map((p) => ({ title: p.title })),
            institution: normalized.institution,
            sourceUrl: profile.sourceUrl,
          });

          // Compare with existing fields
          const existingFields = await tx.personField.findMany({
            where: { personId: existingId },
            select: { field: { select: { slug: true } } },
          });
          const existingSlugs = new Set(existingFields.map((f) => f.field.slug));

          const newFields = newInferredSlugs.filter((s) => !existingSlugs.has(s));
          if (newFields.length > 0) {
            const fieldRecords = await tx.field.findMany({
              where: { slug: { in: newFields } },
              select: { id: true, slug: true },
            });
            if (fieldRecords.length > 0) {
              await tx.personField.createMany({
                data: fieldRecords.map((f) => ({
                  personId: existingId,
                  fieldId: f.id,
                  isPrimary: false, // not primary — existing fields take precedence
                })),
                skipDuplicates: true,
              });
              console.log(
                `[Scheduler]   ↳ Re-evaluation: added ${fieldRecords.length} new fields: ${fieldRecords.map((f) => f.slug).join(', ')}`,
              );
            }
          }
        }
      }
    } catch (fieldErr) {
      console.warn(`[Scheduler]   ↳ Field inference failed for ${profile.nameZh}:`, fieldErr);
    }

    console.log(
      `[Scheduler] Updated: ${profile.nameZh} (${existingId}) [${profile.researchUpdates.length} research, ${profile.competitionUpdates.length} comp, ${profile.evaluationUpdates.length} eval]`,
    );
  });
}

// ─── Stale Profile Refresh ───

/** Max consecutive stale-refresh failures before marking profile inactive */
const MAX_STALE_FAILURES = 4;

/**
 * Calculate backoff delay (in days) for a given consecutive failure count.
 * 1st failure → 14d, 2nd → 28d, 3rd → 56d, 4th+ → give up (deactivate).
 */
function staleBackoffDays(failureCount: number): number {
  return CONFIG.PROFILE_UPDATE_INTERVAL_DAYS * Math.pow(2, failureCount - 1);
}

async function updateStaleProfiles(): Promise<number> {
  const staleDate = new Date(
    Date.now() - CONFIG.PROFILE_UPDATE_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
  );

  const stalePersons = await prisma.person.findMany({
    where: {
      isActive: true,
      AND: [
        {
          OR: [
            { lastScrapedAt: { lt: staleDate } },
            { lastScrapedAt: null },
          ],
        },
      ],
    },
    orderBy: { lastScrapedAt: { sort: 'asc', nulls: 'first' } },
    take: CONFIG.MAX_STALE_UPDATES,
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      website: true,
      metadata: true,
    },
  });

  // Process stale profiles with concurrency — each profile is an independent HTTP fetch
  const CONCURRENT_STALE = 3;
  const queue = [...stalePersons];
  let updated = 0;

  async function refreshOne(person: typeof stalePersons[0]): Promise<boolean> {
    try {
      // Extract university key and source URL from stored metadata
      const meta = (person.metadata || {}) as Record<string, unknown>;
      const rawMeta = (meta.rawMetadata || {}) as Record<string, unknown>;
      const universityKey = (rawMeta.universityKey || meta.universityKey) as string | undefined;
      const sourceUrl = ((person.website || rawMeta.sourceUrl || meta.sourceUrl) as string | undefined);

      // Track consecutive stale-refresh failures via metadata
      const staleFailures = (meta.staleRefreshFailures as number) || 0;

      // Try to re-scrape the profile page
      let reScraped = false;
      if (sourceUrl && universityKey) {
        const freshProfile = await fetchAndParseProfile(sourceUrl, universityKey);
        if (freshProfile && freshProfile.nameZh) {
          // Update core metrics from fresh scrape
          const updateData: Record<string, unknown> = {
            lastScrapedAt: new Date(),
          };
          // Reset failure count on success
          (updateData.metadata as Record<string, unknown>) = {
            ...meta as Record<string, unknown>,
            staleRefreshFailures: 0,
            lastStaleRefreshSuccess: new Date().toISOString(),
          };

          if (freshProfile.bio) updateData.bioZh = freshProfile.bio;
          if (freshProfile.title) updateData.title = freshProfile.title;
          if (freshProfile.department) updateData.department = freshProfile.department;
          if (freshProfile.email) updateData.email = freshProfile.email;
          if (freshProfile.publicationCount) updateData.publicationCount = freshProfile.publicationCount;

          await prisma.person.update({
            where: { id: person.id },
            data: updateData,
          });

          // Import new research updates
          if (freshProfile.researchUpdates && freshProfile.researchUpdates.length > 0) {
            const existingTitles = await prisma.researchUpdate.findMany({
              where: { personId: person.id },
              select: { title: true },
            });
            const existingSet = new Set(
              existingTitles.map((r) => r.title.toLowerCase().substring(0, 60)),
            );
            const newUpdates = freshProfile.researchUpdates.filter(
              (u) => !existingSet.has(u.title.toLowerCase().substring(0, 60)),
            );
            if (newUpdates.length > 0) {
              await prisma.researchUpdate.createMany({
                data: newUpdates.slice(0, 30).map((u) => ({
                  personId: person.id,
                  title: u.title,
                  description: u.description,
                  url: u.url,
                  source: u.source,
                  publishedAt: u.publishedAt ? new Date(u.publishedAt) : null,
                })),
                skipDuplicates: true,
              });
            }
          }

          // Import new publications
          if (freshProfile.publications && freshProfile.publications.length > 0) {
            await prisma.publication.createMany({
              data: freshProfile.publications.slice(0, 50).map((pub) => ({
                personId: person.id,
                title: pub.title,
                authors: pub.authors.join('; '),
                journal: pub.journal,
                year: pub.year,
                doi: pub.doi,
                url: pub.url,
                citationCount: pub.citationCount,
                abstract: pub.abstract,
                source: 'SCRAPER_REFRESH',
                publishedAt: pub.publishedAt ? new Date(pub.publishedAt) : null,
              })),
              skipDuplicates: true,
            });
          }

          reScraped = true;
          console.log(`[Scheduler] Re-scraped stale profile: ${person.nameZh} (${person.id}) — failures reset`);
        }
      }

      if (!reScraped) {
        const newFailures = staleFailures + 1;

        if (newFailures >= MAX_STALE_FAILURES) {
          // Too many consecutive failures — mark inactive to stop retrying
          await prisma.person.update({
            where: { id: person.id },
            data: {
              isActive: false,
              lastScrapedAt: new Date(),
              metadata: {
                ...meta as Record<string, unknown>,
                staleRefreshFailures: newFailures,
                deactivatedReason: `Stale refresh failed ${newFailures} consecutive times`,
                deactivatedAt: new Date().toISOString(),
              },
            },
          });
          console.log(
            `[Scheduler] ⛔ ${person.nameZh}: deactivated after ${newFailures} consecutive stale-refresh failures`,
          );
        } else {
          // Exponential backoff — set timestamp so next retry is further out
          const backoffDays = staleBackoffDays(newFailures);
          const nextRetryDate = new Date(
            Date.now() + backoffDays * 24 * 60 * 60 * 1000,
          );
          // We set lastScrapedAt forward so the profile won't be picked up until backoff elapses
          const backoffScrapedAt = new Date(
            Date.now() - (CONFIG.PROFILE_UPDATE_INTERVAL_DAYS - backoffDays) * 24 * 60 * 60 * 1000,
          );

          await prisma.person.update({
            where: { id: person.id },
            data: {
              lastScrapedAt: backoffScrapedAt,
              metadata: {
                ...meta as Record<string, unknown>,
                staleRefreshFailures: newFailures,
                lastStaleRefreshAttempt: new Date().toISOString(),
                nextStaleRefreshAfter: nextRetryDate.toISOString(),
              },
            },
          });
          console.log(
            `[Scheduler] ⚠ ${person.nameZh}: stale refresh failed (#${newFailures}), backoff ${backoffDays}d, next retry after ${nextRetryDate.toISOString().slice(0, 10)}`,
          );
        }
      }

      return true; // reScraped or handled
    } catch (err) {
      console.error(`[Scheduler] Failed to update stale profile ${person.id}:`, err);
      return false;
    }
  }

  // Worker pool for concurrent stale profile refresh (3 concurrent HTTP fetches)
  async function worker() {
    while (queue.length > 0) {
      const person = queue.shift()!;
      const refreshed = await refreshOne(person);
      if (refreshed) updated++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENT_STALE, stalePersons.length) }, () => worker()),
  );

  if (updated > 0) {
    console.log(`[Scheduler] Updated ${updated} stale profiles`);
  }
  return updated;
}

// ─── Manual Refresh ───

export async function refreshPersonData(personId: string): Promise<void> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
    },
  });

  if (!person) throw new Error('Person not found');

  const nameZh = person.nameZh;
  const institution = person.institution;
  if (!nameZh || !institution) {
    console.warn(`[Scheduler] Cannot refresh ${personId}: no name or institution`);
    return;
  }

  // Find matching university
  const allUniversities = getSupportedUniversities();
  const matchingUni = allUniversities.find(
    (u) =>
      institution.includes(u.nameZh) || institution.includes(u.nameEn),
  );

  if (!matchingUni) {
    console.warn(
      `[Scheduler] Cannot refresh ${personId}: no matching university for "${institution}"`,
    );
    return;
  }

  // Try to fetch from each faculty list
  const uni = await import('./cn-university').then((m) =>
    m.getUniversityConfig(matchingUni.key),
  );
  if (!uni) return;

  for (const listConfig of uni.facultyLists) {
    try {
      // Fetch the faculty list page and look for this person
      const response = await fetch(listConfig.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      });

      if (!response.ok) continue;
      const html = await response.text();

      if (html.includes(nameZh)) {
        // Found them — try to find their profile link
        const linkPattern = new RegExp(
          `<a[^>]*href="([^"]*${encodeURIComponent(nameZh)}[^"]*|${nameZh}[^"]*)"[^>]*>[^<]*${nameZh}[^<]*</a>`,
          'i',
        );
        const linkMatch = html.match(linkPattern);

        if (linkMatch) {
          let profileUrl = linkMatch[1];
          if (profileUrl.startsWith('/')) {
            const baseUrl = new URL(listConfig.url);
            profileUrl = `${baseUrl.origin}${profileUrl}`;
          } else if (!profileUrl.startsWith('http')) {
            const base = listConfig.url.substring(
              0,
              listConfig.url.lastIndexOf('/') + 1,
            );
            profileUrl = `${base}${profileUrl}`;
          }

          const parsed = await fetchAndParseProfile(
            profileUrl,
            matchingUni.key,
          );
          if (parsed && parsed.email) {
            await prisma.person.update({
              where: { id: personId },
              data: {
                email: parsed.email,
                website: parsed.website,
                bioZh: parsed.bio,
                department: parsed.department,
                lastScrapedAt: new Date(),
              },
            });
            console.log(`[Scheduler] Refreshed: ${personId} (${nameZh})`);
            return;
          }
        }

        // Found on list but couldn't parse profile — still update timestamp
        await prisma.person.update({
          where: { id: personId },
          data: { lastScrapedAt: new Date() },
        });
        console.log(`[Scheduler] Touch-refreshed: ${personId} (${nameZh})`);
        return;
      }
    } catch (err) {
      continue;
    }
  }

  console.warn(`[Scheduler] Could not find ${nameZh} on any faculty list`);
}

// ─── Helpers ───

async function getRunCount(): Promise<number> {
  const count = await prisma.auditLog.count({
    where: { action: 'SCHEDULED_SCRAPE' },
  });
  return count;
}

async function getLastCitationAnalysisDate(): Promise<Date | null> {
  const lastLog = await prisma.auditLog.findFirst({
    where: { action: 'CITATION_ANALYSIS' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return lastLog?.createdAt || null;
}

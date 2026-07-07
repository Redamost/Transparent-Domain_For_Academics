// ─── Person Deduplicator ───
// Matches normalized scraped persons against existing database records.
// Uses fuzzy name matching, institution overlap, field overlap, and external ID matching.
// Prevents duplicate person entries from multiple scraping sources.

import { prisma } from '@/lib/prisma';
import type { NormalizedPerson, DedupResult } from './types';
import {
  canonicalizeName,
  generateNameVariants,
  calculatePersonSimilarity,
} from './normalizer';
import type { ScrapedPerson } from './types';

// ─── Name-based DB Lookup ───

/**
 * Find potential matches in the existing database for a given person name.
 * Uses both exact and fuzzy matching strategies.
 */
async function findCandidateMatches(
  person: NormalizedPerson
): Promise<Array<{
  id: string;
  nameZh: string;
  nameEn: string | null;
  institution: string | null;
  orcidId: string | null;
  googleScholarId: string | null;
  researchGateId: string | null;
}>> {
  // Strategy 1: Exact external ID match (strongest signal)
  const idConditions = [];
  if (person.orcidId) {
    idConditions.push({ orcidId: person.orcidId });
  }
  if (person.googleScholarId) {
    idConditions.push({ googleScholarId: person.googleScholarId });
  }
  if (person.researchGateId) {
    idConditions.push({ researchGateId: person.researchGateId });
  }

  if (idConditions.length > 0) {
    const exactMatch = await prisma.person.findFirst({
      where: { OR: idConditions },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        institution: true,
        orcidId: true,
        googleScholarId: true,
        researchGateId: true,
      },
    });
    if (exactMatch) return [exactMatch];
  }

  // Strategy 2: Name + institution search
  const candidates: Awaited<ReturnType<typeof findCandidateMatches>> = [];

  const searchName = person.nameEn || person.nameZh;
  if (!searchName) return [];

  const canonical = canonicalizeName(searchName);
  const variants = generateNameVariants(canonical);

  // Build a query that checks both nameZh and nameEn
  const nameConditions = [];
  for (const variant of variants.slice(0, 5)) {
    nameConditions.push(
      { nameZh: { contains: variant, mode: 'insensitive' as const } },
      { nameEn: { contains: variant, mode: 'insensitive' as const } }
    );
  }

  if (nameConditions.length > 0) {
    const nameMatches = await prisma.person.findMany({
      where: {
        OR: nameConditions,
        isActive: true,
      },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        institution: true,
        orcidId: true,
        googleScholarId: true,
        researchGateId: true,
      },
      take: 20,
    });

    candidates.push(...nameMatches);
  }

  // Strategy 3: Also search by institution + department for common names
  if (person.institution && candidates.length > 0) {
    const instMatches = await prisma.person.findMany({
      where: {
        institution: { contains: person.institution, mode: 'insensitive' },
        isActive: true,
      },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        institution: true,
        orcidId: true,
        googleScholarId: true,
        researchGateId: true,
      },
      take: 30,
    });

    // Merge unique
    const seen = new Set(candidates.map((c) => c.id));
    for (const m of instMatches) {
      if (!seen.has(m.id)) {
        candidates.push(m);
        seen.add(m.id);
      }
    }
  }

  return candidates;
}

// ─── Similarity Calculation ───

/**
 * Calculate similarity between a normalized person and an existing DB record.
 */
function similarityWithDbRecord(
  person: NormalizedPerson,
  dbRecord: {
    id: string;
    nameZh: string;
    nameEn: string | null;
    institution: string | null;
    orcidId: string | null;
    googleScholarId: string | null;
    researchGateId: string | null;
  }
): number {
  let score = 0;
  let total = 0;

  // External ID matching (strong signals)
  // Only include ID weight if the person has at least one external ID to match against.
  // Otherwise a person without ORCID/GoogleScholar/ResearchGate IDs can never reach
  // the match threshold, even with exact name + institution match.
  const hasExternalId = !!(person.orcidId || person.googleScholarId || person.researchGateId);
  if (hasExternalId) {
    if (person.orcidId && dbRecord.orcidId === person.orcidId) score += 0.5;
    if (person.googleScholarId && dbRecord.googleScholarId === person.googleScholarId) score += 0.4;
    if (person.researchGateId && dbRecord.researchGateId === person.researchGateId) score += 0.4;
    total += 0.5;
  }

  // Name similarity
  const personName = person.nameEn || person.nameZh || '';
  const dbName = dbRecord.nameEn || dbRecord.nameZh;
  if (personName && dbName) {
    // Create lightweight ScrapedPerson-like objects for similarity calculation
    const a: ScrapedPerson = {
      sourceId: '', source: 'GOOGLE_SCHOLAR', nameZh: person.nameZh, nameEn: person.nameEn,
      alternativeNames: [], title: null, institution: null, department: null, email: null,
      website: null, avatarUrl: null, bio: null, hIndex: null, citationCount: null,
      publicationCount: null, fields: [], publications: [], researchUpdates: [], competitionUpdates: [], evaluationUpdates: [], rawMetadata: {}, sourceUrl: null,
    };
    const b: ScrapedPerson = {
      sourceId: '', source: 'GOOGLE_SCHOLAR', nameZh: dbRecord.nameZh, nameEn: dbRecord.nameEn,
      alternativeNames: [], title: null, institution: null, department: null, email: null,
      website: null, avatarUrl: null, bio: null, hIndex: null, citationCount: null,
      publicationCount: null, fields: [], publications: [], researchUpdates: [], competitionUpdates: [], evaluationUpdates: [], rawMetadata: {}, sourceUrl: null,
    };
    const nameScore = calculatePersonSimilarity(a, b);
    score += nameScore * 0.4;
  }
  total += 0.4;

  // Institution match
  if (person.institution && dbRecord.institution) {
    if (
      person.institution.toLowerCase() === dbRecord.institution.toLowerCase()
    ) {
      score += 0.1;
    }
  }
  total += 0.1;

  return total > 0 ? score / total : 0;
}

// ─── Main API ───

/**
 * Main deduplication function.
 * Attempts to match a normalized person against existing database records.
 * Returns match decision with confidence score.
 */
export async function deduplicatePerson(
  person: NormalizedPerson
): Promise<DedupResult> {
  // Find candidates
  const candidates = await findCandidateMatches(person);

  if (candidates.length === 0) {
    return {
      matched: false,
      existingPersonId: null,
      confidence: 0,
      reason: 'No candidate matches found in database',
    };
  }

  // Score each candidate
  let bestMatch: (typeof candidates)[0] | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = similarityWithDbRecord(person, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // Decision thresholds
  const HIGH_CONFIDENCE = 0.85;
  const MEDIUM_CONFIDENCE = 0.65;

  if (bestScore >= HIGH_CONFIDENCE && bestMatch) {
    return {
      matched: true,
      existingPersonId: bestMatch.id,
      confidence: bestScore,
      reason: `High-confidence match by ${person.orcidId ? 'ORCID' : person.googleScholarId ? 'Scholar ID' : 'name + institution'}`,
    };
  }

  if (bestScore >= MEDIUM_CONFIDENCE && bestMatch) {
    return {
      matched: true,
      existingPersonId: bestMatch.id,
      confidence: bestScore,
      reason: 'Medium-confidence match — recommend manual review',
    };
  }

  return {
    matched: false,
    existingPersonId: null,
    confidence: bestScore,
    reason: bestScore > 0
      ? `Best match score ${bestScore.toFixed(2)} below threshold—creating new record`
      : 'No meaningful match found',
  };
}

/**
 * Batch deduplicate multiple normalized persons.
 * For high-confidence matches, returns the existing person IDs.
 * For new entries, returns null.
 */
/**
 * Run async tasks with a concurrency limit to avoid overwhelming DB connections.
 */
async function withConcurrencyLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number = 5
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        const value = await fn(item);
        results.push({ status: 'fulfilled', value });
      } catch (reason) {
        results.push({ status: 'rejected', reason });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

/**
 * Batch deduplicate multiple normalized persons with parallel execution.
 * For high-confidence matches, returns the existing person IDs.
 * For new entries, returns null.
 */
export async function batchDeduplicate(
  persons: NormalizedPerson[]
): Promise<Map<NormalizedPerson, DedupResult>> {
  const results = new Map<NormalizedPerson, DedupResult>();

  const settled = await withConcurrencyLimit(
    persons,
    async (person) => {
      try {
        return { person, result: await deduplicatePerson(person) };
      } catch (error) {
        console.error(`[Dedup] Error processing ${person.nameEn || person.nameZh}:`, error);
        return {
          person,
          result: {
            matched: false,
            existingPersonId: null,
            confidence: 0,
            reason: `Error during dedup: ${error}`,
          } as DedupResult,
        };
      }
    },
    10 // Limit concurrent DB queries (increased from 5 — connection pools are 10-20)
  );

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.set(s.value.person, s.value.result);
    } else {
      console.error('[Dedup] Unexpected batch worker failure:', s.reason);
    }
  }

  return results;
}

/**
 * Google Scholar Enricher — bridge from scraper to database.
 *
 * Takes ScholarProfile data from google-scholar.ts and:
 * 1. Updates Person record with hIndex, citationCount, publicationCount
 * 2. Stores googleScholarId for future incremental updates
 * 3. Imports publications (title-based dedup)
 * 4. Updates nameEn if GS provides a better one (Phase 4: pinyin verification)
 * 5. Infers research fields from GS interests
 *
 * Follows the same pattern as openalex-enricher.ts for consistency.
 */

import { prisma } from '@/lib/prisma';
import type { ScholarProfile, ScholarPublication } from './google-scholar';
import { isValidPersonName } from './name-validator';

// ─── Config ──────────────────────────────────────────────────────────
const CONFIG = {
  MAX_PER_RUN: 20,
  MAX_PUBLICATIONS: 50,
  REQUEST_DELAY_MS: 35_000,
};

// ─── Types ───────────────────────────────────────────────────────────
export interface ScholarEnrichmentResult {
  personId: string;
  nameZh: string;
  googleScholarId: string | null;
  hIndex: number | null;
  citationCount: number | null;
  publicationCount: number | null;
  papersImported: number;
  nameUpdated: boolean;
  interests: string[];
}

export interface ScholarBatchStats {
  totalProcessed: number;
  totalMatched: number;
  totalPapersImported: number;
  totalNamesUpdated: number;
  errors: number;
  results: ScholarEnrichmentResult[];
}

// ─── Normalize title for dedup ───────────────────────────────────────
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿\s]/g, '') // Keep alphanumeric + Chinese + spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Single Scholar Enrichment ───────────────────────────────────────
export async function enrichPersonFromScholar(
  personId: string,
  profile: ScholarProfile,
): Promise<ScholarEnrichmentResult> {
  const result: ScholarEnrichmentResult = {
    personId,
    nameZh: '',
    googleScholarId: profile.googleScholarId || null,
    hIndex: profile.hIndex,
    citationCount: profile.citationCount,
    publicationCount: profile.publications.length,
    papersImported: 0,
    nameUpdated: false,
    interests: profile.interests,
  };

  try {
    // Get current person data for comparison
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, nameZh: true, nameEn: true },
    });
    if (!person) return result;
    result.nameZh = person.nameZh;

    // Phase 4: If GS provides a name that's different from our pinyin name,
    // prefer the GS name (scholar's self-reported name is more accurate)
    let nameEn = person.nameEn;
    if (profile.nameEn && profile.nameEn !== person.nameEn) {
      // Only update if our current name is pinyin-generated (no source mark means pinyin)
      // or if the GS name looks more "natural" (has Western name patterns)
      const hasWesternPattern = /^[A-Z][a-z]+ [A-Z][a-z]+/.test(profile.nameEn);
      if (hasWesternPattern || !person.nameEn) {
        nameEn = profile.nameEn;
        result.nameUpdated = true;
      }
    }

    // Update Person record
    await prisma.person.update({
      where: { id: personId },
      data: {
        hIndex: profile.hIndex ?? undefined,
        citationCount: profile.citationCount ?? undefined,
        publicationCount: profile.publications.length || undefined,
        googleScholarId: profile.googleScholarId || undefined,
        nameEn: nameEn ?? undefined,
        lastScrapedAt: new Date(),
        metadata: {
          googleScholarEnrichedAt: new Date().toISOString(),
          googleScholarName: profile.nameEn,
        },
      },
    });

    // Import publications (title-based dedup — GS doesn't provide DOIs)
    if (profile.publications.length > 0) {
      // Get existing publication titles for this person
      const existingPubs = await prisma.publication.findMany({
        where: { personId },
        select: { id: true, title: true },
      });

      const existingTitles = new Set(
        existingPubs.map(p => normalizeTitle(p.title)),
      );

      const pubs = profile.publications.slice(0, CONFIG.MAX_PUBLICATIONS);
      let importedCount = 0;

      for (const pub of pubs) {
        const normTitle = normalizeTitle(pub.title);
        if (!normTitle || existingTitles.has(normTitle)) continue;

        try {
          await prisma.publication.create({
            data: {
              personId,
              title: pub.title,
              authors: pub.authors || undefined,
              journal: pub.journal || undefined,
              year: pub.year || undefined,
              url: pub.url || undefined,
              citationCount: pub.citationCount ?? undefined,
              source: 'GOOGLE_SCHOLAR',
            },
          });
          existingTitles.add(normTitle);
          importedCount++;
        } catch {
          // Skip duplicates
        }
      }

      result.papersImported = importedCount;
    }

    // Infer research fields from GS interests (if person has no fields yet)
    if (profile.interests.length > 0) {
      try {
        const existingFieldCount = await prisma.personField.count({
          where: { personId },
        });
        if (existingFieldCount === 0) {
          // Map GS interests to field slugs using keyword matching
          const { inferFields } = await import('./field-inference');
          const inferredSlugs = inferFields({
            researchText: profile.interests.join('; '),
            publications: profile.publications.slice(0, 10).map(p => ({ title: p.title })),
          });

          if (inferredSlugs.length > 0 && inferredSlugs.length <= 4) {
            const fieldRecords = await prisma.field.findMany({
              where: { slug: { in: inferredSlugs } },
              select: { id: true, slug: true },
            });
            if (fieldRecords.length > 0) {
              await prisma.personField.createMany({
                data: fieldRecords.map((f, i) => ({
                  personId,
                  fieldId: f.id,
                  isPrimary: i === 0,
                })),
                skipDuplicates: true,
              });
            }
          }
        }
      } catch {
        // Non-critical
      }
    }

    console.log(
      `  [GS Enrich] ${person.nameZh}: h=${profile.hIndex} cites=${profile.citationCount} pubs+${result.papersImported} nameUpd=${result.nameUpdated}`,
    );
  } catch (error) {
    console.error(`  [GS Enrich] Error for ${result.nameZh}:`, error);
  }

  return result;
}

// ─── Batch Enrichment ────────────────────────────────────────────────
export async function batchEnrichFromScholar(
  enrichmentMap: Map<string, ScholarProfile>,
): Promise<ScholarBatchStats> {
  const stats: ScholarBatchStats = {
    totalProcessed: 0,
    totalMatched: 0,
    totalPapersImported: 0,
    totalNamesUpdated: 0,
    errors: 0,
    results: [],
  };

  console.log(`[Scholar] Batch enriching ${enrichmentMap.size} scholars...`);

  for (const [personId, profile] of enrichmentMap) {
    const result = await enrichPersonFromScholar(personId, profile);
    stats.results.push(result);
    stats.totalProcessed++;

    if (result.googleScholarId) {
      stats.totalMatched++;
    }
    stats.totalPapersImported += result.papersImported;
    if (result.nameUpdated) {
      stats.totalNamesUpdated++;
    }
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: 'GOOGLE_SCHOLAR_ENRICHMENT',
      entityType: 'SYSTEM',
      newData: {
        totalProcessed: stats.totalProcessed,
        totalMatched: stats.totalMatched,
        totalPapersImported: stats.totalPapersImported,
        totalNamesUpdated: stats.totalNamesUpdated,
        errors: stats.errors,
      },
    },
  });

  console.log(
    `[Scholar] Batch complete: ${stats.totalMatched}/${stats.totalProcessed} matched, ` +
    `${stats.totalPapersImported} papers, ${stats.totalNamesUpdated} names updated`,
  );

  return stats;
}

/**
 * Select the best candidates for Google Scholar enrichment.
 *
 * Priority:
 * 1. Scholars with institution but no hIndex (biggest data gap)
 * 2. Scholars with pinyin nameEn (higher chance of GS match)
 * 3. More recently scraped scholars first
 */
export async function selectScholarCandidates(limit = CONFIG.MAX_PER_RUN) {
  const candidates = await prisma.person.findMany({
    where: {
      isActive: true,
      hIndex: null, // Primary target: missing academic metrics
      nameEn: { not: null }, // Need English name to search GS
      institution: { not: null },
    },
    orderBy: [
      { lastScrapedAt: { sort: 'desc', nulls: 'last' } },
      { score: 'desc' },
    ],
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
    },
    take: limit,
  });

  // Filter out garbage nameEn values (org names, field names, garbled text)
  const validCandidates = candidates.filter((c) => {
    const nameCheck = isValidPersonName(c.nameEn);
    if (!nameCheck.valid) {
      console.log(
        `[Scholar] Skipping candidate with invalid nameEn: "${c.nameEn}" (${nameCheck.reason})`,
      );
      return false;
    }
    return true;
  });

  if (validCandidates.length < candidates.length) {
    console.log(
      `[Scholar] Filtered out ${candidates.length - validCandidates.length} candidates with garbage nameEn`,
    );
  }

  console.log(
    `[Scholar] Selected ${validCandidates.length} candidates for GS enrichment ` +
    `(hIndex=null + has nameEn + has institution)`,
  );

  return validCandidates;
}

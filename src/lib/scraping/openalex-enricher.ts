// ─── OpenAlex Enricher ───
// Bridges the OpenAlex API client to the database scheduler.
// For each scholar, queries OpenAlex to find matching author profile,
// extracts hIndex / citationCount / publicationCount / paper list,
// and persists enriched data to the database.
//
// OpenAlex is FREE — no API key required. Rate limit: ~10 req/s.
// We use 150ms delay between requests (~6.6 req/s) for polite usage.

import { prisma } from '@/lib/prisma';
import {
  findScholarOnOpenAlex,
  getAuthorWorks,
  openAlexWorkToPublication,
  getBudgetStatus,
} from './openalex';
import type { OpenAlexAuthor } from './openalex';
import type { ScrapedPublication } from './types';
import { inferFieldsFromPublications } from './field-inference';

// ─── Config ───

const CONFIG = {
  /** Max scholars to enrich per batch run */
  MAX_PER_RUN: 200,
  /** Min confidence to accept an OpenAlex match */
  MIN_CONFIDENCE: 0.5,
  /** Max papers to import per scholar */
  MAX_PAPERS_PER_SCHOLAR: 50,
};

// ─── Types ───

export interface EnrichmentResult {
  personId: string;
  nameZh: string;
  matched: boolean;
  confidence: number;
  hIndex: number | null;
  citationCount: number | null;
  publicationCount: number | null;
  papersImported: number;
  error?: string;
}

export interface BatchEnrichmentStats {
  totalProcessed: number;
  totalMatched: number;
  totalPapersImported: number;
  errors: number;
  results: EnrichmentResult[];
}

/**
 * Deduplicate similar field slugs using similarity groups.
 * Fields within the same group are collapsed to the parent field,
 * reducing false diversity when a scholar's papers span related areas.
 */
function deduplicateSimilarFields(
  slugs: string[],
  groups: Record<string, string[]>,
): string[] {
  const result: string[] = [];
  const covered = new Set<string>();

  for (const slug of slugs) {
    if (covered.has(slug)) continue;

    // Check if this slug is a parent or child in any group
    let parentSlug = slug;
    for (const [parent, children] of Object.entries(groups)) {
      if (slug === parent || children.includes(slug)) {
        parentSlug = parent;
        break;
      }
    }

    if (!covered.has(parentSlug)) {
      result.push(parentSlug);
      covered.add(parentSlug);
      // Mark all children as covered
      const children = groups[parentSlug];
      if (children) children.forEach(c => covered.add(c));
    }
  }

  return result;
}

// ─── Single Scholar Enrichment ───

/**
 * Enrich a single person with OpenAlex data.
 * Searches by Chinese name + institution, matches best author,
 * and imports papers + metrics.
 */
export async function enrichPersonWithOpenAlex(
  personId: string,
  nameZh: string,
  institution: string | null,
  nameEn?: string | null,
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    personId,
    nameZh,
    matched: false,
    confidence: 0,
    hIndex: null,
    citationCount: null,
    publicationCount: null,
    papersImported: 0,
  };

  try {
    // 1. Search OpenAlex for this scholar
    const match = await findScholarOnOpenAlex(nameZh, institution, nameEn);

    if (!match || match.confidence < CONFIG.MIN_CONFIDENCE) {
      result.confidence = match?.confidence || 0;
      // Mark as attempted — retry only after 3 days to avoid wasting budget
      await prisma.person.update({
        where: { id: personId },
        data: {
          lastScrapedAt: new Date(),
          metadata: {
            openAlexAttemptedAt: new Date().toISOString(),
            openAlexConfidence: match?.confidence || 0,
          },
        },
      }).catch(() => { /* non-critical */ });
      return result;
    }

    const author: OpenAlexAuthor = match.author;
    result.matched = true;
    result.confidence = match.confidence;
    result.hIndex = author.summary_stats?.h_index || null;
    result.citationCount = author.cited_by_count || null;
    result.publicationCount = author.works_count || null;

    // 2. Update Person record with metrics
    await prisma.person.update({
      where: { id: personId },
      data: {
        hIndex: result.hIndex,
        citationCount: result.citationCount,
        publicationCount: result.publicationCount,
        lastScrapedAt: new Date(),
        metadata: {
          source: 'CN_UNIVERSITY',
          openAlexId: author.id,
          openAlexEnrichedAt: new Date().toISOString(),
          openAlexConfidence: match.confidence,
        },
      },
    });

    // 3. Fetch and import papers
    const works = await getAuthorWorks(author.id, {
      per_page: CONFIG.MAX_PAPERS_PER_SCHOLAR,
    });

    if (works.length > 0) {
      const publications: ScrapedPublication[] = works.map(openAlexWorkToPublication);

      // Get existing DOIs for this person (single query)
      const dois = publications.map((p) => p.doi).filter(Boolean) as string[];
      const existingDois = new Set(
        (
          await prisma.publication.findMany({
            where: { personId, doi: { in: dois } },
            select: { doi: true },
          })
        )
          .map((p) => p.doi!.toLowerCase())
          .filter(Boolean),
      );

      // Filter to truly new publications
      const newPubs = publications.filter(
        (pub) => pub.doi && !existingDois.has(pub.doi.toLowerCase()),
      );

      // Batch create all new publications in a single query
      if (newPubs.length > 0) {
        try {
          await prisma.publication.createMany({
            data: newPubs.map((pub) => ({
              personId,
              title: pub.title,
              authors: pub.authors.join('; '),
              journal: pub.journal,
              year: pub.year,
              doi: pub.doi!,
              url: pub.url,
              citationCount: pub.citationCount,
              abstract: pub.abstract,
              source: 'OPENALEX',
              publishedAt: pub.publishedAt ? new Date(pub.publishedAt) : null,
            })),
            skipDuplicates: true,
          });
          result.papersImported = newPubs.length;
        } catch (err) {
          // If batch create fails, fall back to individual inserts
          console.warn(`[OpenAlex] Batch create failed for ${nameZh}, falling back to individual inserts:`, err);
          let importedCount = 0;
          for (const pub of newPubs) {
            try {
              await prisma.publication.create({
                data: {
                  personId,
                  title: pub.title,
                  authors: pub.authors.join('; '),
                  journal: pub.journal,
                  year: pub.year,
                  doi: pub.doi!,
                  url: pub.url,
                  citationCount: pub.citationCount,
                  abstract: pub.abstract,
                  source: 'OPENALEX',
                  publishedAt: pub.publishedAt ? new Date(pub.publishedAt) : null,
                },
              });
              importedCount++;
            } catch {
              // Skip individual duplicates
            }
          }
          result.papersImported = importedCount;
        }
      }

      // 4. Infer fields from newly imported paper titles (if no fields yet)
      if (result.papersImported > 0) {
        try {
          const existingFieldCount = await prisma.personField.count({ where: { personId } });
          if (existingFieldCount === 0) {
            const sampleTitles = publications.slice(0, 10).map((p) => ({ title: p.title }));
            const inferredSlugs = inferFieldsFromPublications(sampleTitles);

            // Coherence check: deduplicate similar fields (e.g., CS+AI+ML are related),
            // then check if remaining distinct fields exceed the threshold.
            // This prevents false-skips for interdisciplinary scholars while
            // still catching mismatched OpenAlex authors.
            const SIMILAR_FIELDS: Record<string, string[]> = {
              'computer-science': ['artificial-intelligence', 'machine-learning', 'computer-vision', 'natural-language-processing', 'reinforcement-learning', 'distributed-systems', 'computer-networks', 'operating-systems', 'algorithms', 'theory', 'quantum-computing'],
              'chemistry': ['organic-chemistry', 'inorganic-chemistry', 'physical-chemistry', 'catalysis', 'natural-products', 'synthetic-methods', 'materials-science'],
              'physics': ['quantum-physics', 'condensed-matter', 'high-energy-physics', 'particle-physics', 'quantum-optics'],
              'biology': ['molecular-biology', 'genomics', 'proteomics', 'gene-editing', 'microbiology'],
              'medicine': ['oncology', 'epidemiology', 'neuroscience', 'immunotherapy', 'neurosurgery', 'precision-oncology', 'cognitive-neuroscience', 'computational-neuroscience'],
              'mathematics': ['probability', 'algebra', 'number-theory', 'algebraic-geometry', 'geometry'],
              'economics': ['microeconomics', 'macroeconomics', 'econometrics'],
              'electronic-engineering': ['cryptography', 'cybersecurity', 'systems-and-networks'],
            };

            const dedupedSlugs = deduplicateSimilarFields(inferredSlugs, SIMILAR_FIELDS);
            if (dedupedSlugs.length > 4) {
              console.log(
                `[OpenAlex] Skipping field assignment for ${nameZh}: too diverse (${dedupedSlugs.length} distinct fields from ${sampleTitles.length} papers — likely mismatch)`,
              );
            } else if (dedupedSlugs.length > 0) {
              const fieldRecords = await prisma.field.findMany({
                where: { slug: { in: dedupedSlugs } },
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
        } catch (fieldErr) {
          // Non-critical — don't fail enrichment for field inference issues
        }
      }
    }

    console.log(
      `[OpenAlex] Enriched: ${nameZh} — hIndex=${result.hIndex}, citations=${result.citationCount}, papers=${result.papersImported}`,
    );
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[OpenAlex] Error enriching ${nameZh}:`, result.error);
  }

  return result;
}

// ─── Batch Enrichment ───

/**
 * Batch-enrich eligible persons who lack hIndex.
 * Prioritizes persons with CN_UNIVERSITY source who have names and institutions.
 *
 * @param limit  Max scholars to process (default: 50)
 * @param specificIds  Optional — only enrich these specific person IDs
 */
export async function batchEnrichFromOpenAlex(
  limit = CONFIG.MAX_PER_RUN,
  specificIds?: string[],
): Promise<BatchEnrichmentStats> {
  const stats: BatchEnrichmentStats = {
    totalProcessed: 0,
    totalMatched: 0,
    totalPapersImported: 0,
    errors: 0,
    results: [],
  };

  // Find eligible persons: have name + institution, no hIndex, recently scraped or CN_UNIVERSITY source
  let candidates;

  if (specificIds && specificIds.length > 0) {
    candidates = await prisma.person.findMany({
      where: {
        id: { in: specificIds },
        isActive: true,
      },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        institution: true,
      },
      take: limit,
    });
  } else {
    // Tiered selection: scholars with English names match better
    // Tier 1: English name + institution (highest match rate)
    candidates = await prisma.person.findMany({
      where: {
        isActive: true,
        hIndex: null,
        nameZh: { not: '' },
        nameEn: { not: null },
        institution: { not: null },
      },
      orderBy: { score: 'desc' },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        institution: true,
      },
      take: limit,
    });

    // Tier 2: fill remaining slots with scholars lacking English names
    if (candidates.length < limit) {
      const tier2Limit = limit - candidates.length;
      const tier2Candidates = await prisma.person.findMany({
        where: {
          isActive: true,
          hIndex: null,
          nameZh: { not: '' },
          nameEn: null,
          institution: { not: null },
          id: { notIn: candidates.map((c) => c.id) },
        },
        orderBy: { score: 'desc' },
        select: {
          id: true,
          nameZh: true,
          nameEn: true,
          institution: true,
        },
        take: tier2Limit,
      });
      candidates = [...candidates, ...tier2Candidates];
    }
  }

  console.log(
    `[OpenAlex] Batch enriching ${candidates.length} scholars with 4 concurrent workers (limit: ${limit})...`,
  );

  // Process with concurrency — OpenAlex allows ~10 req/s, 4 workers is safe
  const CONCURRENT_ENRICH = 4;
  const queue = [...candidates];
  const results: EnrichmentResult[] = [];

  async function worker() {
    while (queue.length > 0) {
      const person = queue.shift()!;
      // Skip if OpenAlex daily budget is exhausted
      const budget = getBudgetStatus();
      if (!budget.hasBudget) {
        console.log(
          `[OpenAlex] Budget exhausted ($0 remaining). Skipping remaining ${queue.length + 1} scholars.`,
        );
        queue.length = 0; // Clear queue to stop all workers
        return;
      }

      const result = await enrichPersonWithOpenAlex(
        person.id,
        person.nameZh,
        person.institution,
        person.nameEn,
      );

      results.push(result);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENT_ENRICH, candidates.length) }, () => worker()),
  );

  for (const result of results) {
    stats.results.push(result);
    stats.totalProcessed++;
    if (result.matched) {
      stats.totalMatched++;
      stats.totalPapersImported += result.papersImported;
    }
    if (result.error) {
      stats.errors++;
    }
  }

  // Log to audit trail
  await prisma.auditLog.create({
    data: {
      action: 'OPENALEX_ENRICHMENT',
      entityType: 'SYSTEM',
      newData: {
        totalProcessed: stats.totalProcessed,
        totalMatched: stats.totalMatched,
        totalPapersImported: stats.totalPapersImported,
        errors: stats.errors,
      },
    },
  });

  console.log(
    `[OpenAlex] Batch complete: ${stats.totalMatched}/${stats.totalProcessed} matched, ` +
    `${stats.totalPapersImported} papers imported, ${stats.errors} errors`,
  );

  return stats;
}

/**
 * Check how many persons still need OpenAlex enrichment.
 */
export async function getOpenAlexBacklog(): Promise<{
  totalEligible: number;
  enriched: number;
  remaining: number;
}> {
  const [totalEligible, enriched] = await Promise.all([
    prisma.person.count({
      where: {
        isActive: true,
        nameZh: { not: '' },
        institution: { not: null },
      },
    }),
    prisma.person.count({
      where: {
        isActive: true,
        hIndex: { not: null },
      },
    }),
  ]);

  return {
    totalEligible,
    enriched,
    remaining: totalEligible - enriched,
  };
}

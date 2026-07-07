// ─── Semantic Scholar Enricher ───
// Connects the Semantic Scholar API to the database.
// Enriches Person records with hIndex, citationCount, and paper imports.

import { prisma } from '@/lib/prisma';
import { matchAuthor } from './semantic-scholar';
import { inferFieldsFromPublications } from './field-inference';

interface EnrichStats {
  totalProcessed: number;
  totalMatched: number;
  totalPapersImported: number;
  totalNamesUpdated: number;
}

/**
 * Select candidates eligible for Semantic Scholar enrichment.
 * Priority: persons with institution but no hIndex, who haven't been tried recently.
 */
export async function selectCandidates(
  limit: number,
): Promise<Array<{ id: string; nameZh: string; nameEn: string | null; institution: string | null }>> {
  // Tiered selection: prioritize scholars with English names (better matching)
  // Tier 1: English name + institution + no hIndex
  let candidates = await prisma.person.findMany({
    where: {
      isActive: true,
      institution: { not: null },
      nameEn: { not: null },
      hIndex: null,
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
    },
    take: limit,
    orderBy: { score: 'desc' },
  });

  // Tier 2: fill remaining slots with scholars lacking English names
  if (candidates.length < limit) {
    const more = await prisma.person.findMany({
      where: {
        isActive: true,
        institution: { not: null },
        nameEn: null,
        hIndex: null,
        id: { notIn: candidates.map((c) => c.id) },
      },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        institution: true,
      },
      take: limit - candidates.length,
      orderBy: { score: 'desc' },
    });
    candidates = [...candidates, ...more];
  }

  return candidates;
}

/**
 * Batch enrich candidates from Semantic Scholar.
 */
export async function batchEnrichFromS2(
  limit: number,
): Promise<EnrichStats> {
  const candidates = await selectCandidates(limit);
  const stats: EnrichStats = {
    totalProcessed: candidates.length,
    totalMatched: 0,
    totalPapersImported: 0,
    totalNamesUpdated: 0,
  };

  if (candidates.length === 0) return stats;

  // Process with concurrency — S2 allows 100 req/5min, 5 workers with 3s intervals is safe
  const CONCURRENT_ENRICH = 3;
  const queue = [...candidates];
  const enrichedIds: string[] = [];

  async function processOne(candidate: typeof candidates[0]): Promise<void> {
    try {
      const result = await matchAuthor(
        candidate.nameZh,
        candidate.nameEn || candidate.nameZh,
        candidate.institution!,
      );

      if (!result || result.confidence < 0.4) return;

      const { profile } = result;
      stats.totalMatched++;

      // Update person record
      const updateData: Record<string, unknown> = {
        lastScrapedAt: new Date(),
      };

      if (profile.hIndex != null) updateData.hIndex = profile.hIndex;
      if (profile.citationCount != null) updateData.citationCount = profile.citationCount;
      if (profile.paperCount != null) updateData.publicationCount = profile.paperCount;

      // If the S2 name is English and we don't have it, store it
      if (profile.name && !candidate.nameEn && /^[a-zA-Z\s.\-']+$/.test(profile.name)) {
        updateData.nameEn = profile.name;
        stats.totalNamesUpdated++;
      }

      await prisma.person.update({
        where: { id: candidate.id },
        data: updateData,
      });

      // Import papers
      if (profile.papers && profile.papers.length > 0) {
        const paperRecords = profile.papers
          .filter((p) => p.title && p.title.length > 3)
          .slice(0, 50)
          .map((p) => ({
            personId: candidate.id,
            title: p.title,
            authors: p.authors?.map((a) => a.name).join('; ') || 'Unknown',
            journal: p.venue || null,
            year: p.year || null,
            doi: p.externalIds?.DOI || null,
            url: p.url || null,
            citationCount: p.citationCount || null,
            abstract: p.abstract || null,
            source: 'SEMANTIC_SCHOLAR',
            publishedAt: p.year ? new Date(`${p.year}-01-01`) : null,
          }));

        if (paperRecords.length > 0) {
          // Filter out papers that already exist (by DOI)
          const doisToCheck = paperRecords.map((p) => p.doi).filter(Boolean) as string[];
          const existingDois = doisToCheck.length > 0
            ? new Set(
                (
                  await prisma.publication.findMany({
                    where: {
                      personId: candidate.id,
                      doi: { in: doisToCheck },
                    },
                    select: { doi: true },
                  })
                ).map((p) => p.doi),
              )
            : new Set<string>();

          const newPapers = paperRecords.filter(
            (p) => !p.doi || !existingDois.has(p.doi),
          );

          if (newPapers.length > 0) {
            await prisma.publication.createMany({
              data: newPapers,
              skipDuplicates: true,
            });
            stats.totalPapersImported += newPapers.length;
          }
        }
      }

      // Infer fields from imported papers if no fields exist yet
      if (stats.totalPapersImported > 0) {
        try {
          const existingFieldCount = await prisma.personField.count({ where: { personId: candidate.id } });
          if (existingFieldCount === 0) {
            const recentPapers = await prisma.publication.findMany({
              where: { personId: candidate.id, source: 'SEMANTIC_SCHOLAR' },
              select: { title: true },
              take: 10,
            });
            const inferredSlugs = inferFieldsFromPublications(recentPapers);

            if (inferredSlugs.length > 0 && inferredSlugs.length <= 4) {
              const fieldRecords = await prisma.field.findMany({
                where: { slug: { in: inferredSlugs } },
                select: { id: true, slug: true },
              });
              if (fieldRecords.length > 0) {
                await prisma.personField.createMany({
                  data: fieldRecords.map((f, i) => ({
                    personId: candidate.id,
                    fieldId: f.id,
                    isPrimary: i === 0,
                  })),
                  skipDuplicates: true,
                });
                console.log(`[S2] Inferred ${fieldRecords.length} fields for ${candidate.nameZh}: ${fieldRecords.map((f: { slug: string }) => f.slug).join(', ')}`);
              }
            }
          }
        } catch (fieldErr) {
          // Non-critical — don't fail enrichment for field inference issues
        }
      }

      enrichedIds.push(candidate.id);
      console.log(
        `[S2] Enriched: ${candidate.nameZh} — hIndex=${profile.hIndex}, citations=${profile.citationCount}, papers=${profile.papers?.length || 0}`,
      );
    } catch (err) {
      console.error(`[S2] Error enriching ${candidate.nameZh}:`, err);
    }
  }

  async function worker() {
    while (queue.length > 0) {
      const candidate = queue.shift()!;
      await processOne(candidate);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENT_ENRICH, candidates.length) }, () => worker()),
  );

  return stats;
}

/**
 * Get backlog size for Semantic Scholar enrichment.
 */
export async function getBacklog(): Promise<{
  totalEligible: number;
  remaining: number;
}> {
  const totalEligible = await prisma.person.count({
    where: {
      isActive: true,
      institution: { not: null },
    },
  });

  const remaining = await prisma.person.count({
    where: {
      isActive: true,
      institution: { not: null },
      OR: [
        { hIndex: null },
        { lastScrapedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  return { totalEligible, remaining };
}

// ─── Research Feed Enricher ───
// Enriches research feed entries with additional context:
//  - Links papers to known persons in the database
//  - Adds field categorization
//  - Computes relevance scores
//  - Merges arXiv data with existing ResearchUpdate records

import { prisma } from '@/lib/prisma';
import type { ArxivPaper } from './arxiv';
import { getRecentPapersForResearcher, getLatestPapersForFields } from './arxiv';

// ─── Types ───

export interface EnrichedFeedItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: 'ARXIV' | 'CUSTOM' | 'PUBMED' | 'DOI';
  publishedAt: string;
  authors: string[];
  categories: string[];
  personId: string | null; // Linked person in our database
  personName: string | null;
  fieldSlug: string | null;
  relevanceScore: number; // 0-100
  isNew: boolean; // New since last user visit
}

export interface FeedQuery {
  fieldSlugs?: string[];
  personIds?: string[];
  maxItems?: number;
  daysBack?: number;
  sources?: string[];
}

// ─── Name Matching ───

/**
 * Match an arxiv author name to a person in our database.
 * Uses fuzzy matching on name parts.
 */
async function matchAuthorToPerson(
  authorName: string
): Promise<{ id: string; nameZh: string; nameEn: string | null; score: number } | null> {
  const parts = authorName.split(/\s+/).filter((p) => p.length > 1);
  if (parts.length === 0) return null;

  // Build search conditions
  const conditions = [];
  for (const part of parts) {
    conditions.push(
      { nameEn: { contains: part, mode: 'insensitive' as const } },
      { nameZh: { contains: part, mode: 'insensitive' as const } }
    );
  }

  const matches = await prisma.person.findMany({
    where: {
      OR: conditions as any,
      isActive: true,
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
    },
    take: 10,
  });

  if (matches.length === 0) return null;

  // Score each match
  let bestMatch: (typeof matches)[0] | null = null;
  let bestScore = 0;

  const authorLower = authorName.toLowerCase();

  for (const match of matches) {
    const matchName = (match.nameEn || match.nameZh).toLowerCase();
    // Simple token overlap
    const matchTokens = new Set(matchName.split(/\s+/));
    const authorTokens = new Set(authorLower.split(/\s+/));
    const intersection = new Set([...matchTokens].filter((t) => authorTokens.has(t)));
    const union = new Set([...matchTokens, ...authorTokens]);
    const score = union.size > 0 ? intersection.size / union.size : 0;

    // Bonus for exact match
    if (matchName === authorLower) {
      if (score === 1) { /* exact match - keep full score */ }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }

  if (bestMatch && bestScore >= 0.5) {
    return {
      id: bestMatch.id,
      nameZh: bestMatch.nameZh,
      nameEn: bestMatch.nameEn,
      score: bestScore,
    };
  }

  return null;
}

// ─── arXiv → ResearchUpdate Conversion ───

function arxivToFeedItem(
  paper: ArxivPaper,
  personInfo: { id: string; name: string } | null,
  fieldSlug: string | null
): EnrichedFeedItem {
  const relevanceScore = calculateRelevanceScore(paper, personInfo);

  return {
    id: `arxiv_${paper.id}`,
    title: paper.title,
    description: paper.summary.substring(0, 500),
    url: paper.absUrl,
    source: 'ARXIV',
    publishedAt: paper.published.toISOString(),
    authors: paper.authors,
    categories: paper.categories,
    personId: personInfo?.id || null,
    personName: personInfo?.name || null,
    fieldSlug,
    relevanceScore,
    isNew: true,
  };
}

/**
 * Calculate a relevance score (0-100) for a paper.
 * Higher score = more likely to be important to users.
 */
function calculateRelevanceScore(
  paper: ArxivPaper,
  personInfo: { id: string; name: string } | null
): number {
  let score = 50; // Baseline

  // Has DOI = likely published in a journal → higher credibility
  if (paper.doi) score += 10;

  // Has journal reference → already peer-reviewed
  if (paper.journalRef) score += 10;

  // Multiple authors → likely collaborative research
  if (paper.authors.length >= 3) score += 5;
  if (paper.authors.length >= 10) score += 5;

  // Linked to a known person → directly relevant
  if (personInfo) score += 15;

  // Recent publication → more relevant
  const daysSincePub = Math.floor(
    (Date.now() - paper.published.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSincePub <= 7) score += 10;
  else if (daysSincePub <= 30) score += 5;

  // Multiple categories → interdisciplinary (interesting)
  if (paper.categories.length >= 2) score += 3;

  // Author comment often indicates conference acceptance
  if (paper.comment && paper.comment.toLowerCase().includes('accepted')) score += 7;

  return Math.min(score, 100);
}

// ─── Main Feed Functions ───

/**
 * Generate a feed for a specific person (their recent papers).
 */
export async function generatePersonFeed(
  personId: string,
  maxItems = 10,
  daysBack = 30
): Promise<EnrichedFeedItem[]> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      fields: { include: { field: true } },
    },
  });

  if (!person) return [];

  const authorName = person.nameEn || person.nameZh;
  const fieldSlugs = person.fields.map((pf) => pf.field.slug);

  // Fetch from arXiv
  const papers = await getRecentPapersForResearcher(authorName, fieldSlugs, maxItems, daysBack);

  // Convert to feed items
  return papers.map((paper) =>
    arxivToFeedItem(paper, { id: person.id, name: authorName }, fieldSlugs[0] || null)
  );
}

/**
 * Generate a feed for a specific field (latest papers in that field).
 */
export async function generateFieldFeed(
  fieldSlug: string,
  maxItems = 20
): Promise<EnrichedFeedItem[]> {
  const papers = await getLatestPapersForFields([fieldSlug], maxItems);
  const fieldPapers = papers.get(fieldSlug) || [];

  const items: EnrichedFeedItem[] = [];

  for (const paper of fieldPapers) {
    // Try to match authors to known persons
    let personInfo: { id: string; name: string } | null = null;
    for (const author of paper.authors.slice(0, 5)) {
      const match = await matchAuthorToPerson(author);
      if (match) {
        personInfo = { id: match.id, name: match.nameEn || match.nameZh };
        break;
      }
    }

    items.push(arxivToFeedItem(paper, personInfo, fieldSlug));
  }

  return items.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Generate a personalized feed for a community participant
 * based on their monitored fields.
 */
export async function generatePersonalizedFeed(
  fieldSlugs: string[],
  maxItems = 30,
  daysBack = 14
): Promise<EnrichedFeedItem[]> {
  const papersByField = await getLatestPapersForFields(
    fieldSlugs,
    Math.ceil(maxItems / fieldSlugs.length)
  );

  const items: EnrichedFeedItem[] = [];

  for (const [slug, papers] of papersByField) {
    for (const paper of papers) {
      // Quick match against first 3 authors
      let personInfo: { id: string; name: string } | null = null;
      for (const author of paper.authors.slice(0, 3)) {
        const match = await matchAuthorToPerson(author);
        if (match && match.score >= 0.6) {
          personInfo = { id: match.id, name: match.nameEn || match.nameZh };
          break;
        }
      }

      items.push(arxivToFeedItem(paper, personInfo, slug));
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxItems);
}

/**
 * Sync arXiv papers to the ResearchUpdate table for a given person.
 * This is the bridge between the feed system and the database.
 */
export async function syncArxivToResearchUpdates(
  personId: string,
  maxNewUpdates = 5
): Promise<number> {
  const items = await generatePersonFeed(personId, maxNewUpdates, 60);

  let synced = 0;

  for (const item of items) {
    // Check for existing record
    const existing = await prisma.researchUpdate.findFirst({
      where: {
        personId,
        url: item.url,
      },
    });

    if (!existing) {
      await prisma.researchUpdate.create({
        data: {
          personId,
          title: item.title,
          description: item.description,
          url: item.url,
          source: item.source,
          publishedAt: new Date(item.publishedAt),
        },
      });
      synced++;
    }
  }

  return synced;
}

/**
 * Sync arXiv papers for all persons in a field.
 */
export async function syncFieldResearchUpdates(
  fieldSlug: string,
  maxPerPerson = 3
): Promise<number> {
  const persons = await prisma.person.findMany({
    where: {
      isActive: true,
      fields: { some: { field: { slug: fieldSlug } } },
    },
    select: { id: true },
    take: 50,
  });

  let totalSynced = 0;

  for (const person of persons) {
    try {
      const synced = await syncArxivToResearchUpdates(person.id, maxPerPerson);
      totalSynced += synced;
    } catch (error) {
      console.error(`[Feed] Error syncing for person ${person.id}:`, error);
    }
  }

  console.log(`[Feed] Synced ${totalSynced} updates for field ${fieldSlug}`);
  return totalSynced;
}

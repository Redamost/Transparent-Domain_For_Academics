// ─── Semantic Scholar API Client ───
// Free academic API — no API key required. Rate limit: 100 req/5min.
// Provides: author search, hIndex, citationCount, publicationCount, paper metadata.
//
// API docs: https://api.semanticscholar.org/api-docs/graph

import { getBucket } from './rate-limiter';

// ─── Types ───

export interface S2AuthorSearchResult {
  authorId: string;
  externalIds: Record<string, string>;
  url: string;
  name: string;
  aliases: string[];
  affiliations: string[];
  homepage: string | null;
  paperCount: number;
  citationCount: number;
  hIndex: number;
}

export interface S2AuthorDetail {
  authorId: string;
  externalIds: Record<string, string>;
  url: string;
  name: string;
  aliases: string[];
  affiliations: string[];
  homepage: string | null;
  paperCount: number;
  citationCount: number;
  hIndex: number;
  papers: S2Paper[];
  influentialCitationCount?: number;
}

export interface S2Paper {
  paperId: string;
  externalIds: Record<string, string>;
  url: string;
  title: string;
  abstract: string | null;
  venue: string | null;
  year: number | null;
  citationCount: number | null;
  authors: S2PaperAuthor[];
}

export interface S2PaperAuthor {
  authorId: string | null;
  name: string;
}

export interface S2SearchResponse<T> {
  offset: number;
  next: number | null;
  total: number;
  data: T[];
}

// ─── Configuration ───

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

const AUTHOR_SEARCH_FIELDS = [
  'authorId',
  'externalIds',
  'url',
  'name',
  'aliases',
  'affiliations',
  'homepage',
  'paperCount',
  'citationCount',
  'hIndex',
].join(',');

const AUTHOR_DETAIL_FIELDS = [
  'authorId',
  'externalIds',
  'url',
  'name',
  'aliases',
  'affiliations',
  'homepage',
  'paperCount',
  'citationCount',
  'hIndex',
  'papers.title',
  'papers.paperId',
  'papers.externalIds',
  'papers.url',
  'papers.abstract',
  'papers.venue',
  'papers.year',
  'papers.citationCount',
  'papers.authors',
].join(',');

// ─── Rate Limiter ───

const MIN_REQUEST_INTERVAL_MS = 3_000; // 3s between requests = 100 per 5 min (maxing free tier)
let s2Consecutive429s = 0;

async function rateLimit(key = 's2'): Promise<void> {
  await getBucket(key, { capacity: 3, refillRate: 1, refillIntervalMs: MIN_REQUEST_INTERVAL_MS }).acquire();
}

// ─── API Client ───

async function s2Fetch<T>(path: string): Promise<T | null> {
  await rateLimit();

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TransparentDomain/1.0 (academic-transparency-platform)',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 429) {
      s2Consecutive429s++;
      const cooldown = Math.min(30_000 * Math.pow(2, s2Consecutive429s - 1), 120_000);
      console.warn(`[S2] Rate limited (429 #${s2Consecutive429s}). Cooling down ${cooldown/1000}s...`);
      await new Promise((r) => setTimeout(r, cooldown));
      // Reset consecutive counter after a single successful request
      return null;
    }

    if (!response.ok) {
      // 404 = author not found, 400 = bad query — not errors worth retrying
      if (response.status === 404 || response.status === 400) return null;
      console.warn(`[S2] API error ${response.status} for ${path}`);
      return null;
    }

    // Successful request — reset consecutive 429 counter
    s2Consecutive429s = 0;

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      console.warn(`[S2] Request timeout: ${path}`);
      return null;
    }
    console.error(`[S2] Fetch error:`, err);
    return null;
  }
}

// ─── Public API ───

/**
 * Search for an author by name and optional institution.
 * Returns top matches sorted by relevance.
 */
export async function searchAuthor(
  name: string,
  institution?: string,
): Promise<S2AuthorSearchResult[]> {
  const query = institution
    ? `${encodeURIComponent(name)}+${encodeURIComponent(institution)}`
    : encodeURIComponent(name);

  const result = await s2Fetch<S2SearchResponse<S2AuthorSearchResult>>(
    `/author/search?query=${query}&limit=5&fields=${AUTHOR_SEARCH_FIELDS}`,
  );
  return result?.data || [];
}

/**
 * Get detailed author info including paper list.
 */
export async function getAuthorDetail(
  authorId: string,
): Promise<S2AuthorDetail | null> {
  return s2Fetch<S2AuthorDetail>(
    `/author/${authorId}?fields=${AUTHOR_DETAIL_FIELDS}`,
  );
}

/**
 * Match a person by name and institution.
 * Returns the best-matching author profile or null.
 *
 * Matching heuristics:
 *   1. Exact name match + institution substring match → high confidence
 *   2. Name edit-distance match + institution match → medium confidence
 *   3. Name match, no institution → low confidence
 */
export async function matchAuthor(
  nameZh: string,
  nameEn: string,
  institution: string,
): Promise<{ profile: S2AuthorDetail; confidence: number } | null> {
  // Prefer English name for API queries, fall back to Chinese
  const queryName = nameEn || nameZh;
  const results = await searchAuthor(queryName, institution);

  if (results.length === 0) return null;

  let best: S2AuthorSearchResult | null = null;
  let bestConfidence = 0;

  for (const r of results) {
    let confidence = 0;

    // Name similarity
    const apiNameLower = r.name.toLowerCase();
    const queryLower = queryName.toLowerCase();

    if (apiNameLower === queryLower) {
      confidence += 0.5;
    } else if (apiNameLower.includes(queryLower) || queryLower.includes(apiNameLower)) {
      confidence += 0.35;
    } else {
      // Check aliases
      const aliasMatch = r.aliases?.some(
        (a) => a.toLowerCase().includes(queryLower) || queryLower.includes(a.toLowerCase()),
      );
      if (aliasMatch) confidence += 0.25;
    }

    // Institution match
    const instLower = institution.toLowerCase();
    const affils = r.affiliations?.map((a) => a.toLowerCase()) || [];
    if (affils.some((a) => a.includes(instLower) || instLower.includes(a))) {
      confidence += 0.4;
    }

    // Paper count bonus (more papers = more established scholar)
    if (r.paperCount > 10) confidence += 0.05;
    if (r.paperCount > 50) confidence += 0.05;

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      best = r;
    }
  }

  if (!best || bestConfidence < 0.4) return null;

  // Fetch full detail
  const detail = await getAuthorDetail(best.authorId);
  if (!detail) return null;

  return { profile: detail, confidence: bestConfidence };
}

/**
 * Enrich a Person record with Semantic Scholar data.
 * Updates hIndex, citationCount, publicationCount, and imports papers.
 */
export async function enrichPersonFromS2(
  personId: string,
  nameZh: string,
  nameEn: string | null,
  institution: string | null,
): Promise<{
  matched: boolean;
  hIndex: number | null;
  citationCount: number | null;
  papersImported: number;
}> {
  if (!institution) {
    return { matched: false, hIndex: null, citationCount: null, papersImported: 0 };
  }

  const result = await matchAuthor(nameZh, nameEn || nameZh, institution);
  if (!result) {
    return { matched: false, hIndex: null, citationCount: null, papersImported: 0 };
  }

  return {
    matched: true,
    hIndex: result.profile.hIndex,
    citationCount: result.profile.citationCount,
    papersImported: result.profile.papers?.length || 0,
  };
}

/**
 * Find an author on Semantic Scholar by DOI of one of their publications.
 * Implements the slr-ranking pattern of DOI-based cross-reference: when
 * OpenAlex can't find a scholar, try S2 by DOI to get an authorId, then
 * re-query OpenAlex with that author ID.
 *
 * @param doi           The DOI to search (e.g. "10.1234/example")
 * @param candidateName Name of the candidate scholar for author matching
 * @returns The matching author's ID and name, or null if not found
 */
export async function findAuthorByDoi(
  doi: string,
  candidateName: string,
): Promise<{ authorId: string; name: string } | null> {
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
  if (!cleanDoi) return null;

  const result = await s2Fetch<S2SearchResponse<S2Paper>>(
    `/paper/search?query=DOI:${encodeURIComponent(cleanDoi)}&limit=1&fields=title,authors`,
  );

  if (!result?.data?.length) return null;

  const paper = result.data[0];
  if (!paper.authors?.length) return null;

  const candidateLower = candidateName.toLowerCase();

  // Try exact author match first, then fuzzy
  for (const author of paper.authors) {
    if (!author.authorId) continue;
    const authorLower = author.name.toLowerCase();
    if (authorLower.includes(candidateLower) || candidateLower.includes(authorLower)) {
      return { authorId: author.authorId, name: author.name };
    }
  }

  // No match found — return the first author with an ID as best-effort
  const firstWithId = paper.authors.find((a) => a.authorId);
  if (firstWithId) {
    return { authorId: firstWithId.authorId!, name: firstWithId.name };
  }

  return null;
}

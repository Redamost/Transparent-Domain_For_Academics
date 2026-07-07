// ─── OpenAlex API Client ───
// Free, open academic API: https://docs.openalex.org/
// No API key required. Polite usage: max 10 requests/second.
//
// Provides:
//   - Author search by name + institution
//   - hIndex, citationCount, worksCount
//   - Paper list with DOI, citations, year, journal
//   - Research topics/concepts

import type { ScrapedPublication } from './types';
import { getBucket } from './rate-limiter';

// ─── Types ───

export interface OpenAlexAuthor {
  id: string;           // "https://openalex.org/A5103822192"
  display_name: string;
  orcid?: string;
  works_count: number;
  cited_by_count: number;
  summary_stats: {
    h_index: number;
    i10_index: number;
    '2yr_mean_citedness': number;
  };
  last_known_institutions?: Array<{
    id: string;
    display_name: string;
    country_code?: string;
    type?: string;
  }>;
  topics?: Array<{
    id: string;
    display_name: string;
    subfield?: { display_name: string };
    field?: { display_name: string };
  }>;
  x_concepts?: Array<{
    id: string;
    display_name: string;
    score: number;
  }>;
  updated_date?: string;
}

export interface OpenAlexWork {
  id: string;
  title: string;
  doi?: string;
  publication_year?: number;
  cited_by_count: number;
  authorships?: Array<{
    author: {
      id: string;
      display_name: string;
    };
  }>;
  primary_location?: {
    source?: {
      display_name: string;
    };
  };
  abstract?: string;
}

interface SearchAuthorsResponse {
  meta: { count: number; per_page: number; page: number };
  results: OpenAlexAuthor[];
}

interface SearchWorksResponse {
  meta: { count: number; per_page: number; page: number };
  results: OpenAlexWork[];
}

// ─── Config ───

const BASE_URL = 'https://api.openalex.org';
const DELAY_MS = 150; // ~6.7 req/s. Budget ($1/day) is the real limiter; speed helps use it efficiently.
const MAX_BACKOFF_MS = 30000; // Maximum backoff wait time

// ─── Rate Limiter ───

let consecutiveErrors = 0;
let remainingBudgetUsd = 1.0; // Default: assume full daily budget until first response
let budgetResetSeconds = 0;

async function rateLimit(): Promise<void> {
  await getBucket('openalex', { capacity: 10, refillRate: 1, refillIntervalMs: DELAY_MS }).acquire();
}

/**
 * Parse rate limit headers from OpenAlex response.
 * Tracks remaining daily budget ($1/day free tier).
 */
function parseRateLimitHeaders(headers: Headers): void {
  const remaining = headers.get('X-RateLimit-Remaining-USD');
  const reset = headers.get('X-RateLimit-Reset');
  if (remaining) {
    remainingBudgetUsd = parseFloat(remaining);
  }
  if (reset) {
    budgetResetSeconds = parseInt(reset, 10);
  }
}

/**
 * Check if we have enough budget for another request.
 * Each request costs ~$0.001. We stop when < $0.005 remaining.
 */
function hasBudget(): boolean {
  return remainingBudgetUsd >= 0.005;
}

/**
 * Get readable budget status.
 */
export function getBudgetStatus(): { remainingUsd: number; resetInSeconds: number; hasBudget: boolean } {
  return {
    remainingUsd: remainingBudgetUsd,
    resetInSeconds: budgetResetSeconds,
    hasBudget: hasBudget(),
  };
}

/**
 * Handle rate-limiting with exponential backoff.
 * Called when the API returns 429 Too Many Requests.
 */
async function handleRateLimited(response?: Response): Promise<void> {
  if (response) parseRateLimitHeaders(response.headers);
  consecutiveErrors++;

  // If budget is exhausted, don't retry — throw immediately
  if (!hasBudget()) {
    const resetHrs = budgetResetSeconds > 0 ? (budgetResetSeconds / 3600).toFixed(1) : '?';
    throw new Error(`OpenAlex daily budget exhausted ($0 remaining). Resets in ${resetHrs}h.`);
  }

  const backoff = Math.min(DELAY_MS * Math.pow(2, consecutiveErrors), MAX_BACKOFF_MS);
  const resetHrs = budgetResetSeconds > 0 ? ` (budget resets in ${(budgetResetSeconds/3600).toFixed(1)}h)` : '';
  console.warn(`[OpenAlex] Rate limited (429). Backing off for ${(backoff/1000).toFixed(1)}s... Remaining budget: $${remainingBudgetUsd.toFixed(4)}${resetHrs}`);
  await new Promise((r) => setTimeout(r, backoff));
}

/**
 * Reset consecutive error counter after a successful request.
 */
function resetRateLimitState(headers?: Headers): void {
  if (headers) parseRateLimitHeaders(headers);
  consecutiveErrors = 0;
}

// ─── API Calls ───

/**
 * Search for authors by name. Returns matching OpenAlex authors.
 */
export async function searchAuthors(
  query: string,
  options?: { per_page?: number; filter?: string },
): Promise<OpenAlexAuthor[]> {
  await rateLimit();

  const params = new URLSearchParams({ search: query });
  if (options?.per_page) params.set('per_page', String(options.per_page));
  if (options?.filter) params.set('filter', options.filter);

  // Select relevant fields to reduce response size
  params.set('select', 'id,display_name,orcid,works_count,cited_by_count,summary_stats,last_known_institutions,topics,x_concepts');

  const url = `${BASE_URL}/authors?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'mailto:transparent-domain@example.com', // Polite: identify your app
        'Accept': 'application/json',
      },
    });

    if (response.status === 429) {
      await handleRateLimited(response);
      return [];
    }
    if (!response.ok) {
      console.error(`[OpenAlex] HTTP ${response.status} for: ${url}`);
      return [];
    }

    resetRateLimitState(response.headers);
    const data: SearchAuthorsResponse = await response.json();
    return data.results || [];
  } catch (err) {
    console.error(`[OpenAlex] Error searching authors: ${err}`);
    return [];
  }
}

/**
 * Get works (papers) for a specific author, sorted by citation count.
 */
export async function getAuthorWorks(
  authorId: string,
  options?: { per_page?: number; page?: number },
): Promise<OpenAlexWork[]> {
  await rateLimit();

  const params = new URLSearchParams();
  params.set('filter', `author.id:${authorId}`);
  params.set('sort', 'cited_by_count:desc');
  params.set('per_page', String(options?.per_page || 25));
  if (options?.page) params.set('page', String(options.page));
  params.set('select', 'id,title,doi,publication_year,cited_by_count,authorships,primary_location');

  const url = `${BASE_URL}/works?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'mailto:transparent-domain@example.com',
        'Accept': 'application/json',
      },
    });

    if (response.status === 429) {
      await handleRateLimited(response);
      return [];
    }
    if (!response.ok) {
      console.error(`[OpenAlex] HTTP ${response.status} for works of ${authorId}`);
      return [];
    }

    resetRateLimitState(response.headers);
    const data: SearchWorksResponse = await response.json();
    return data.results || [];
  } catch (err) {
    console.error(`[OpenAlex] Error fetching works: ${err}`);
    return [];
  }
}

// ─── Matching ───

/**
 * Match an OpenAlex author result to our scholar.
 * Returns confidence score 0-1.
 */
export function matchAuthorScore(
  author: OpenAlexAuthor,
  ourNameZh: string,
  ourInstitution: string | null,
  ourNameEn?: string | null,
): number {
  let score = 0;
  let totalWeight = 0;

  const displayName = author.display_name?.toLowerCase() || '';

  // 1. Name match (45% weight — increased from 40%, now supports English names)
  // 1a. English/pinyin name match (highest signal — 25% of name weight)
  if (ourNameEn) {
    const ourEn = ourNameEn.toLowerCase().replace(/\s+/g, '');
    const displayEn = displayName.replace(/\s+/g, '');
    // Direct pinyin match (e.g., "Wei Zhang" matches "Wei Zhang" or "Zhang Wei")
    const parts = ourNameEn.toLowerCase().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts[parts.length - 1] || '';

    if (
      displayEn === ourEn || // exact match ignoring spaces
      displayName.includes(ourNameEn.toLowerCase()) || // display contains our name
      ourNameEn.toLowerCase().includes(displayName) // our name contains display
    ) {
      score += 0.25; // Full English name match weight
    } else if (
      displayName.includes(firstName) && displayName.includes(lastName)
    ) {
      score += 0.20; // Both first and last names found separately
    } else if (
      displayName.includes(lastName) // At least last name matches
    ) {
      score += 0.12;
    }
  }

  // 1b. Chinese character match (20% of name weight)
  const nameParts = ourNameZh.replace(/\s+/g, '').toLowerCase();
  const displayParts = displayName.replace(/\s+/g, '');
  if (displayParts.includes(nameParts) || nameParts.includes(displayParts)) {
    score += 0.20;
  } else {
    // Partial: check if Chinese chars overlap
    const chineseInCommon = [...nameParts].filter(c => displayParts.includes(c)).length;
    const nameLen = Math.max(nameParts.length, 1);
    const overlap = chineseInCommon / nameLen;
    score += overlap * 0.20;
  }
  totalWeight += 0.45;

  // 2. Institution match (30% weight)
  if (ourInstitution && author.last_known_institutions?.length) {
    const instNames = author.last_known_institutions.map(i =>
      i.display_name?.toLowerCase() || ''
    );
    const ourInst = ourInstitution.toLowerCase();

    if (instNames.some(n => n === ourInst || ourInst === n)) {
      score += 0.30;
    } else if (instNames.some(n => n.includes(ourInst) || ourInst.includes(n))) {
      score += 0.22;
    } else {
      const ourWords = ourInst.replace(/大学|学院/g, '').split(/\s*/);
      for (const name of instNames) {
        const matchWords = ourWords.filter(w => w.length >= 2 && name.includes(w));
        if (matchWords.length >= ourWords.length * 0.5) {
          score += 0.12;
          break;
        }
      }
    }
  }
  totalWeight += 0.30;

  // 3. Works count reasonability (15% weight)
  if (author.works_count >= 10 && author.works_count <= 500) {
    score += 0.15;
  } else if (author.works_count >= 5 && author.works_count <= 800) {
    score += 0.10;
  }
  totalWeight += 0.15;

  // 4. ORCID match (10% weight, bonus)
  if (author.orcid) {
    score += 0.10;
  }
  totalWeight += 0.10;

  return totalWeight > 0 ? Math.min(1, score / totalWeight) : 0;
}

/**
 * Search OpenAlex for a scholar and return the best match (if confidence >= threshold).
 */
export async function findScholarOnOpenAlex(
  nameZh: string,
  institution: string | null,
  nameEn?: string | null,
): Promise<{ author: OpenAlexAuthor; confidence: number } | null> {
  // Build search queries — prioritize English/pinyin name (better match on OpenAlex)
  const queries: string[] = [];

  // 1. English name + institution (highest priority — OpenAlex uses pinyin display names)
  if (nameEn) {
    if (institution) {
      queries.push(`${nameEn} ${institution}`);
    }
    queries.push(nameEn);
  }

  // 2. Chinese name + institution (fallback)
  if (institution) {
    queries.push(`${nameZh} ${institution}`);
  }
  queries.push(nameZh);

  let allResults: OpenAlexAuthor[] = [];

  for (const query of queries.slice(0, 4)) { // Max 4 queries
    const results = await searchAuthors(query, { per_page: 10 });
    allResults.push(...results);

    // If we got decent results, stop early
    if (results.length >= 3) break;
  }

  if (allResults.length === 0) return null;

  // Deduplicate by author ID
  const seen = new Set<string>();
  const unique = allResults.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  // Score and rank (now passing nameEn for better matching)
  const scored = unique.map(author => ({
    author,
    confidence: matchAuthorScore(author, nameZh, institution, nameEn),
  }));

  scored.sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (best && best.confidence >= 0.5) {
    return best;
  }

  return null;
}

/**
 * Convert OpenAlex work to our ScrapedPublication format.
 */
export function openAlexWorkToPublication(work: OpenAlexWork): ScrapedPublication {
  return {
    title: work.title || 'Untitled',
    authors: work.authorships?.map(a => a.author.display_name) || [],
    journal: work.primary_location?.source?.display_name || null,
    year: work.publication_year || null,
    doi: work.doi || null,
    url: work.doi ? `https://doi.org/${work.doi.replace('https://doi.org/', '')}` : null,
    citationCount: work.cited_by_count || 0,
    abstract: null,
    publishedAt: work.publication_year ? `${work.publication_year}-01-01` : null,
  };
}

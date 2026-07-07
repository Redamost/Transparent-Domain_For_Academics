// ─── arXiv API Integration ───
// Uses the official arXiv API (free, no key required).
// https://info.arxiv.org/help/api/user-manual.html
//
// Fetches preprints for tracked researchers by name search and field category.
// arXiv categories: https://arxiv.org/category_taxonomy

const ARXIV_API_BASE = 'https://export.arxiv.org/api/query';
const MIN_REQUEST_INTERVAL_MS = 3_000; // 3s between requests (arXiv rate limit)

// ─── Rate Limiter ───

const lastRequestMap = new Map<string, number>();

async function rateLimit(key: string): Promise<void> {
  const now = Date.now();
  const last = lastRequestMap.get(key) || 0;
  const elapsed = now - last;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestMap.set(key, Date.now());
}

// ─── Types ───

export interface ArxivPaper {
  id: string; // arXiv ID (e.g., "2301.12345v1")
  title: string;
  summary: string; // Abstract
  authors: string[]; // Array of author names
  published: Date;
  updated: Date;
  categories: string[]; // arXiv categories (e.g., ["cs.AI", "cs.LG"])
  primaryCategory: string;
  doi: string | null;
  journalRef: string | null; // Journal reference if published
  pdfUrl: string;
  absUrl: string; // Abstract page URL
  comment: string | null; // Author comments (sometimes has #pages, #figures, conference)
}

export interface ArxivSearchParams {
  /** Search query (supports arXiv API syntax: ti:, au:, abs:, cat:, etc.) */
  query: string;
  /** Maximum results (default 10, max 100) */
  maxResults?: number;
  /** Start offset (default 0) */
  start?: number;
  /** Sort by: 'relevance' | 'lastUpdatedDate' | 'submittedDate' */
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  /** Sort order: 'ascending' | 'descending' */
  sortOrder?: 'ascending' | 'descending';
}

// ─── Field → arXiv Category Mapping ───

const FIELD_TO_ARXIV_CATEGORY: Record<string, string[]> = {
  'ai-machine-learning': ['cs.AI', 'cs.LG', 'stat.ML'],
  'computer-vision': ['cs.CV'],
  'nlp': ['cs.CL'],
  'robotics': ['cs.RO'],
  'data-science': ['cs.DB', 'cs.IR', 'stat.ML'],
  'cybersecurity': ['cs.CR'],
  'software-engineering': ['cs.SE'],
  'distributed-systems': ['cs.DC'],
  'computer-networks': ['cs.NI'],
  'hci': ['cs.HC'],
  'theory': ['cs.CC', 'cs.DS'],
  'algorithms': ['cs.DS'],
  'quantum-physics': ['quant-ph'],
  'particle-physics': ['hep-ph', 'hep-ex', 'hep-th'],
  'astrophysics': ['astro-ph.CO', 'astro-ph.GA', 'astro-ph.HE', 'astro-ph.IM'],
  'condensed-matter': ['cond-mat.mes-hall', 'cond-mat.mtrl-sci', 'cond-mat.str-el'],
  'optics-photonics': ['physics.optics'],
  'nuclear-physics': ['nucl-ex', 'nucl-th'],
  'molecular-biology': ['q-bio.MN', 'q-bio.BM'],
  'genetics': ['q-bio.GN'],
  'genomics': ['q-bio.GN'],
  'bioinformatics': ['q-bio.QM', 'q-bio.GN'],
  'neuroscience': ['q-bio.NC'],
  'cell-biology': ['q-bio.CB'],
  'epidemiology': ['q-bio.PE', 'stat.AP'],
};

// ─── arXiv API Client ───

/**
 * Search arXiv for papers matching a query.
 * Supports the arXiv API query syntax.
 *
 * Examples:
 *  - `searchArxiv({ query: 'au:"John Smith"' })` — papers by author
 *  - `searchArxiv({ query: 'cat:cs.AI AND ti:"neural network"' })` — topic search
 *  - `searchArxiv({ query: 'all:"transformer architecture"' })` — full text search
 */
export async function searchArxiv(params: ArxivSearchParams): Promise<ArxivPaper[]> {
  await rateLimit('arxiv');
  const { query, maxResults = 10, start = 0, sortBy = 'submittedDate', sortOrder = 'descending' } = params;

  const url = new URL(ARXIV_API_BASE);
  url.searchParams.set('search_query', query);
  url.searchParams.set('max_results', String(Math.min(maxResults, 100)));
  url.searchParams.set('start', String(start));
  url.searchParams.set('sortBy', sortBy);
  url.searchParams.set('sortOrder', sortOrder);

  console.log(`[arXiv] Searching: ${query.substring(0, 80)}...`);

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'TransparentDomain/1.0 (mailto:admin@transparent-domain.org)' },
  });

  if (!response.ok) {
    throw new Error(`arXiv API error: HTTP ${response.status}`);
  }

  const xml = await response.text();
  return parseArxivAtom(xml);
}

/**
 * Parse arXiv ATOM XML response into structured data.
 */
function parseArxivAtom(xml: string): ArxivPaper[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const entries = doc.getElementsByTagName('entry');
  const papers: ArxivPaper[] = [];

  for (const entry of Array.from(entries)) {
    try {
      const id = entry.getElementsByTagName('id')[0]?.textContent?.trim() || '';
      // Extract pure arXiv ID from the full URL
      const arxivId = id.replace('http://arxiv.org/abs/', '').trim();

      const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() || '';
      const summary = entry.getElementsByTagName('summary')[0]?.textContent?.trim() || '';

      // Authors
      const authorEls = entry.getElementsByTagName('author');
      const authors: string[] = [];
      for (const auth of Array.from(authorEls)) {
        const name = auth.getElementsByTagName('name')[0]?.textContent?.trim();
        if (name) authors.push(name);
      }

      // Dates
      const publishedStr = entry.getElementsByTagName('published')[0]?.textContent?.trim();
      const updatedStr = entry.getElementsByTagName('updated')[0]?.textContent?.trim();
      const published = publishedStr ? new Date(publishedStr) : new Date();
      const updated = updatedStr ? new Date(updatedStr) : published;

      // Categories
      const categoryEls = entry.getElementsByTagName('category');
      const categories: string[] = [];
      let primaryCategory = '';
      for (const cat of Array.from(categoryEls)) {
        const term = cat.getAttribute('term') || '';
        if (term) categories.push(term);
        if (cat.getAttribute('primary') === '1') {
          primaryCategory = term;
        }
      }
      if (!primaryCategory && categories.length > 0) {
        primaryCategory = categories[0];
      }

      // DOI
      const linkEls = entry.getElementsByTagName('link');
      let doi: string | null = null;
      let absUrl = '';
      let pdfUrl = '';
      for (const link of Array.from(linkEls)) {
        const href = link.getAttribute('href') || '';
        const title = link.getAttribute('title') || '';
        if (title === 'doi') doi = href.replace('http://dx.doi.org/', '').replace('https://doi.org/', '');
        if (!title && !link.getAttribute('rel')) absUrl = link.getAttribute('href') || '';
        if (title === 'pdf') pdfUrl = link.getAttribute('href') || '';
      }

      // Journal reference
      const journalRef = entry.getElementsByTagName('arxiv:journal_ref')[0]?.textContent?.trim() ||
        entry.getElementsByTagName('journal_ref')[0]?.textContent?.trim() || null;

      // Comment
      const comment = entry.getElementsByTagName('arxiv:comment')[0]?.textContent?.trim() ||
        entry.getElementsByTagName('comment')[0]?.textContent?.trim() || null;

      papers.push({
        id: arxivId,
        title,
        summary,
        authors,
        published,
        updated,
        categories,
        primaryCategory,
        doi,
        journalRef,
        pdfUrl: pdfUrl || `https://arxiv.org/pdf/${arxivId}`,
        absUrl: absUrl || `https://arxiv.org/abs/${arxivId}`,
        comment,
      });
    } catch (error) {
      console.warn('[arXiv] Failed to parse entry:', error);
    }
  }

  return papers;
}

// ─── Researcher-Specific Queries ───

/**
 * Search for papers by a specific researcher's name.
 * Uses the arXiv `au:` (author) query prefix.
 */
export async function searchPapersByAuthor(
  authorName: string,
  maxResults = 10
): Promise<ArxivPaper[]> {
  // arXiv author names are "Last, First" or "First Last"
  // We construct both variants
  const parts = authorName.split(/\s+/);
  let query: string;

  if (parts.length >= 2) {
    // "Last, First"
    const lastFirst = `au:"${parts[parts.length - 1]}_${parts[0]}"`;
    // "First Last" as separate au: terms
    const firstLast = parts.map((p) => `au:"${p}"`).join(' AND ');
    query = `(${lastFirst}) OR (${firstLast})`;
  } else {
    query = `au:"${authorName}"`;
  }

  return searchArxiv({ query, maxResults, sortBy: 'submittedDate', sortOrder: 'descending' });
}

/**
 * Search for papers in a specific research field (by arXiv category).
 */
export async function searchPapersByField(
  fieldSlug: string,
  maxResults = 20
): Promise<ArxivPaper[]> {
  const categories = FIELD_TO_ARXIV_CATEGORY[fieldSlug];
  if (!categories || categories.length === 0) {
    console.warn(`[arXiv] No category mapping for field: ${fieldSlug}`);
    // Fallback: search the field name as a general query
    return searchArxiv({
      query: `all:"${fieldSlug.replace(/-/g, ' ')}"`,
      maxResults,
      sortBy: 'submittedDate',
      sortOrder: 'descending',
    });
  }

  const catQuery = categories.map((c) => `cat:${c}`).join(' OR ');
  return searchArxiv({
    query: catQuery,
    maxResults,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });
}

/**
 * Search for the latest papers in multiple fields simultaneously.
 */
export async function getLatestPapersForFields(
  fieldSlugs: string[],
  maxPerField = 5
): Promise<Map<string, ArxivPaper[]>> {
  const results = new Map<string, ArxivPaper[]>();

  for (const slug of fieldSlugs) {
    try {
      const papers = await searchPapersByField(slug, maxPerField);
      results.set(slug, papers);
    } catch (error) {
      console.error(`[arXiv] Error fetching papers for field ${slug}:`, error);
      results.set(slug, []);
    }
  }

  return results;
}

/**
 * Get recent papers (last N days) for a researcher by name + fields.
 */
export async function getRecentPapersForResearcher(
  authorName: string,
  fieldSlugs: string[],
  maxResults = 10,
  daysBack = 30
): Promise<ArxivPaper[]> {
  const allPapers: ArxivPaper[] = [];
  const seenIds = new Set<string>();

  // Search by author name
  try {
    const authorPapers = await searchPapersByAuthor(authorName, maxResults);
    for (const paper of authorPapers) {
      if (!seenIds.has(paper.id)) {
        seenIds.add(paper.id);
        allPapers.push(paper);
      }
    }
  } catch (error) {
    console.error(`[arXiv] Author search failed for "${authorName}":`, error);
  }

  // Also search by fields (to catch papers where the author's name variant doesn't match)
  for (const slug of fieldSlugs.slice(0, 3)) {
    try {
      const fieldPapers = await searchPapersByField(slug, maxResults / 2);
      for (const paper of fieldPapers) {
        if (!seenIds.has(paper.id)) {
          // Check if the researcher's name appears in the author list
          const nameLower = authorName.toLowerCase();
          const authorMatch = paper.authors.some(
            (a) => a.toLowerCase().includes(nameLower) || nameLower.includes(a.toLowerCase())
          );
          if (authorMatch) {
            seenIds.add(paper.id);
            allPapers.push(paper);
          }
        }
      }
    } catch (error) {
      // Silently skip field errors in this context
    }
  }

  // Filter by date and sort
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return allPapers
    .filter((p) => p.published >= cutoff)
    .sort((a, b) => b.published.getTime() - a.published.getTime())
    .slice(0, maxResults);
}

/**
 * Search for papers matching a specific keyword/topic.
 */
export async function searchPapersByTopic(
  topic: string,
  maxResults = 20
): Promise<ArxivPaper[]> {
  return searchArxiv({
    query: `all:"${topic}"`,
    maxResults,
    sortBy: 'relevance',
  });
}

// ─── RSS Feed URL Builder ───

/**
 * Build an arXiv RSS feed URL for a field/category.
 * Useful for RSS reader integration or simpler polling.
 */
export function buildArxivRssUrl(category: string): string {
  return `https://rss.arxiv.org/rss/${category}`;
}

/**
 * Build the arXiv new-papers RSS URL (all categories, last 24h).
 */
export function buildArxivNewRssUrl(): string {
  return 'https://rss.arxiv.org/rss/new';
}

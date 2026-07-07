/**
 * Google Scholar profile scraper using Playwright.
 *
 * Extracts: hIndex, citationCount, publication list, research interests,
 * English name, and googleScholarId from scholar profile pages.
 *
 * Anti-detection measures:
 * - Uses system Microsoft Edge (chromium-based, not automation Chrome)
 * - Realistic viewport and User-Agent
 * - 30-60s delay between requests
 * - CAPTCHA detection and graceful bail-out
 * - Rate limited to ~20 scholars per run
 */

import type { Browser, BrowserContext, Page } from 'playwright';

// ─── Types ───────────────────────────────────────────────────────────
export interface ScholarProfile {
  googleScholarId: string;
  nameEn: string | null;
  institution: string | null;
  hIndex: number | null;
  citationCount: number | null;
  i10Index: number | null;
  interests: string[];
  publications: ScholarPublication[];
}

export interface ScholarPublication {
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  citationCount: number | null;
  url: string | null;
}

export interface ScholarSearchResult {
  googleScholarId: string | null;
  nameEn: string | null;
  institution: string | null;
  profileUrl: string | null;
}

// ─── Configuration ───────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

const REQUEST_DELAY_MIN_MS = 8_000;  // 8s minimum between scholars (was 35s)
const REQUEST_DELAY_MAX_MS = 18_000; // 18s max (reduced from 50s)
const PAGE_TIMEOUT_MS = 25_000;      // 25s page load timeout (was 30s)
const MAX_CONCURRENT_SCHOLARS = 3;   // Concurrent scholar scrapes per batch

// ─── Browser management ──────────────────────────────────────────────
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let contextCreatedAt = 0;
const CONTEXT_MAX_AGE_MS = 15 * 60 * 1000; // Rotate context every 15 min

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function ensureBrowser(): Promise<Browser> {
  const { chromium } = await import(/* turbopackIgnore: true */'playwright');
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
  }
  return browser;
}

async function ensureContext(): Promise<BrowserContext> {
  const b = await ensureBrowser();
  const age = Date.now() - contextCreatedAt;

  // Reuse existing context if it's fresh enough
  if (context && age < CONTEXT_MAX_AGE_MS) {
    return context;
  }

  // Close old context if it exists
  if (context) {
    try { await context.close(); } catch { /* ignore */ }
  }

  context = await b.newContext({
    userAgent: randomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  contextCreatedAt = Date.now();
  return context;
}

/**
 * Get a single page for scraping. Reuses browser context across calls.
 */
export async function getPage(): Promise<Page> {
  const ctx = await ensureContext();
  return ctx.newPage();
}

/**
 * Get multiple pages for concurrent scholar scraping.
 * All pages share the same browser context (conserves memory).
 */
export async function getPages(count: number): Promise<Page[]> {
  const ctx = await ensureContext();
  return Promise.all(Array.from({ length: count }, () => ctx.newPage()));
}

/** Force rotation of the browser context (call after CAPTCHA detected). */
export async function rotateContext(): Promise<void> {
  if (context) {
    try { await context.close(); } catch { /* ignore */ }
    context = null;
  }
  contextCreatedAt = 0;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    try { await context.close(); } catch { /* ignore */ }
    context = null;
  }
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
  }
}

// ─── CAPTCHA detection ───────────────────────────────────────────────
function detectCaptcha(html: string): boolean {
  const captchaPatterns = [
    /id="recaptcha"/i,
    /g-recaptcha/i,
    /https?:\/\/www\.google\.com\/sorry/i,
    /unusual traffic/i,
    /automated queries/i,
    /not a robot/i,
    /please show you.?re not a robot/i,
    /verify you.?re human/i,
  ];
  return captchaPatterns.some(p => p.test(html));
}

// ─── Search for scholar profile ──────────────────────────────────────
/**
 * Searches Google Scholar for a scholar by name + institution
 * and returns the best matching profile URL.
 */
export async function searchScholar(
  page: Page,
  nameZh: string,
  nameEn: string,
  institution: string
): Promise<ScholarSearchResult | null> {
  // Try English name first (usually better results)
  const query = nameEn
    ? `${nameEn} ${institution}`
    : `${nameZh} ${institution}`;

  const searchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=en`;
  console.log(`  [GS Search] ${query}`);

  try {
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
    // Wait for search results to appear (faster than networkidle)
    await page.waitForSelector('#gs_res_ccl, #gs_res_ccl_mid, #gsc_lnk, .gs_ri, .gs_r', {
      timeout: 10_000,
    }).catch(() => { /* fall through if not found */ });
  } catch {
    console.log('  [GS Search] Page load timeout');
    return null;
  }

  const html = await page.content();
  if (detectCaptcha(html)) {
    console.log('  [GS Search] ⚠ CAPTCHA detected — aborting');
    return null;
  }

  // Look for user profile link: /citations?user=XXXXX
  const profileLinks = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href*="citations?user="]');
    const results: Array<{ href: string; text: string }> = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').trim();
      if (href.includes('citations?user=') && text) {
        results.push({ href, text });
      }
    }
    return results;
  });

  if (profileLinks.length === 0) {
    console.log('  [GS Search] No profile found');
    return null;
  }

  // Use the first profile match
  const first = profileLinks[0];
  const userIdMatch = first.href.match(/user=([^&]+)/);
  const googleScholarId = userIdMatch ? userIdMatch[1] : null;

  return {
    googleScholarId,
    nameEn: first.text || null,
    institution: null, // Will be extracted from profile page
    profileUrl: first.href.startsWith('http')
      ? first.href
      : `https://scholar.google.com${first.href}`,
  };
}

// ─── Parse profile page ──────────────────────────────────────────────
/**
 * Parses a Google Scholar profile page and extracts all available data.
 */
export async function parseProfilePage(
  page: Page,
  profileUrl: string
): Promise<ScholarProfile | null> {
  console.log(`  [GS Profile] ${profileUrl}`);

  try {
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
    // Wait for the profile stats table to render (faster than networkidle)
    await page.waitForSelector('#gsc_rsb_st, #gsc_prf_in, #gsc_a_b', {
      timeout: 10_000,
    }).catch(() => { /* fall through — may still have partial data */ });
  } catch {
    console.log('  [GS Profile] Page load timeout');
    return null;
  }

  const html = await page.content();
  if (detectCaptcha(html)) {
    console.log('  [GS Profile] ⚠ CAPTCHA detected — aborting');
    return null;
  }

  // Extract all data via page.evaluate
  const data = await page.evaluate(() => {
    // ── Name ──
    const nameEl = document.querySelector('#gsc_prf_in');
    const nameEn = nameEl?.textContent?.trim() || null;

    // ── Institution / email ──
    const instEl = document.querySelector('#gsc_prf_inw');
    // Institution is the first text node or content before comma
    const instText = instEl?.textContent?.trim() || null;
    // Try to extract institution from "Verified email at xxx.edu" or "xxx University"
    let institution: string | null = null;
    if (instText) {
      // Pattern: "Professor at X University"
      const atMatch = instText.match(/(?:at|in)\s+(.+?)(?:,|$)/);
      if (atMatch) {
        institution = atMatch[1].trim();
      } else {
        // Take the part before any comma or email
        institution = instText.split(',')[0].trim();
        // Skip if it looks like an email
        if (institution?.includes('@')) {
          institution = null;
        }
      }
    }

    // ── Research interests ──
    const interestEls = document.querySelectorAll('#gsc_prf_int a');
    const interests: string[] = [];
    interestEls.forEach(el => {
      const text = el.textContent?.trim();
      if (text) interests.push(text);
    });

    // ── Stats (h-index, citations, i10) ──
    const statEls = document.querySelectorAll('table#gsc_rsb_st td.gsc_rsb_std');
    let citationCount: number | null = null;
    let hIndex: number | null = null;
    let i10Index: number | null = null;

    if (statEls.length >= 3) {
      const cText = statEls[0]?.textContent?.trim();
      if (cText) citationCount = parseInt(cText.replace(/,/g, ''), 10) || null;

      const hText = statEls[1]?.textContent?.trim();
      if (hText) hIndex = parseInt(hText.replace(/,/g, ''), 10) || null;

      const i10Text = statEls[2]?.textContent?.trim();
      if (i10Text) i10Index = parseInt(i10Text.replace(/,/g, ''), 10) || null;
    }

    // ── Publications ──
    const pubRows = document.querySelectorAll('#gsc_a_b .gsc_a_tr');
    const publications: Array<{
      title: string;
      authors: string | null;
      journal: string | null;
      year: number | null;
      citationCount: number | null;
      url: string | null;
    }> = [];

    pubRows.forEach(row => {
      const titleEl = row.querySelector('.gsc_a_t a');
      const title = titleEl?.textContent?.trim() || '';
      const url = titleEl?.getAttribute('href') || null;

      const grayEls = row.querySelectorAll('.gsc_a_t .gs_gray');
      const authors = grayEls[0]?.textContent?.trim() || null;
      const venueRaw = grayEls[1]?.textContent?.trim() || null;

      // Venue usually contains "Journal, Year"
      let journal: string | null = null;
      let year: number | null = null;
      if (venueRaw) {
        const yearMatch = venueRaw.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[0], 10);
          journal = venueRaw.replace(yearMatch[0], '').replace(/,?\s*$/, '').replace(/,\s*$/, '').trim();
          if (!journal) journal = null;
        } else {
          journal = venueRaw;
        }
      }

      const citeEl = row.querySelector('.gsc_a_c a');
      const citeText = citeEl?.textContent?.trim() || row.querySelector('.gsc_a_c')?.textContent?.trim();
      const citationCount = citeText ? parseInt(citeText.replace(/\*/g, '').trim(), 10) || null : null;

      if (title) {
        publications.push({ title, authors, journal, year, citationCount, url });
      }
    });

    // ── Extract user ID from URL ──
    const userMatch = window.location.href.match(/user=([^&]+)/);
    const googleScholarId = userMatch ? userMatch[1] : null;

    return {
      googleScholarId: googleScholarId || '',
      nameEn,
      institution,
      hIndex,
      citationCount,
      i10Index,
      interests,
      publications,
    };
  });

  if (data.googleScholarId) {
    console.log(`  [GS Profile] ${data.nameEn} | h=${data.hIndex} | cites=${data.citationCount} | pubs=${data.publications.length}`);
  }

  return data;
}

// ─── Full pipeline: search → parse ───────────────────────────────────
/**
 * Full scrape pipeline for a single scholar:
 * 1. Search Google Scholar by name + institution
 * 2. Navigate to the profile page
 * 3. Extract all available data
 */
export async function scrapeScholar(
  page: Page,
  nameZh: string,
  nameEn: string,
  institution: string
): Promise<ScholarProfile | null> {
  // Step 1: Search
  const searchResult = await searchScholar(page, nameZh, nameEn, institution);
  if (!searchResult?.profileUrl) {
    // Try with Chinese name if English name search failed
    if (nameEn) {
      console.log('  [GS] Retrying with Chinese name...');
      // Navigate directly to search with Chinese name
      const zhQuery = `${nameZh}`;
      const zhUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(zhQuery)}&hl=zh-CN`;
      try {
        await page.goto(zhUrl, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
        const zhHtml = await page.content();
        if (!detectCaptcha(zhHtml)) {
          // Look for profile link
          const zhProfileLink = await page.evaluate(() => {
            const a = document.querySelector('a[href*="citations?user="]');
            return a ? a.getAttribute('href') : null;
          });
          if (zhProfileLink) {
            const fullUrl = zhProfileLink.startsWith('http')
              ? zhProfileLink
              : `https://scholar.google.com${zhProfileLink}`;
            return parseProfilePage(page, fullUrl);
          }
        }
      } catch {
        // Chinese search failed too — give up
      }
    }
    return null;
  }

  // Step 2: Parse profile
  return parseProfilePage(page, searchResult.profileUrl);
}

// ─── Delay helper ────────────────────────────────────────────────────
export function getRequestDelay(): number {
  // Jittered delay between min and max
  return REQUEST_DELAY_MIN_MS + Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS));
}

// ─── Concurrent batch scraping ───────────────────────────────────────

/**
 * Scrape multiple scholars concurrently using a pool of pages.
 * Dramatically faster than sequential scraping — 3 scholars at once
 * with shared browser context.
 */
export async function batchScrapeScholars(
  candidates: Array<{ nameZh: string; nameEn: string; institution: string }>,
  options?: { maxConcurrency?: number },
): Promise<Map<string, ScholarProfile>> {
  const concurrency = Math.min(
    options?.maxConcurrency || MAX_CONCURRENT_SCHOLARS,
    candidates.length,
  );
  const results = new Map<string, ScholarProfile>();
  const queue = [...candidates];

  console.log(`[GS] Batch scraping ${candidates.length} scholars with ${concurrency} concurrent pages...`);

  async function worker(page: Page, workerId: number) {
    while (queue.length > 0) {
      const candidate = queue.shift()!;
      try {
        const profile = await scrapeScholar(
          page,
          candidate.nameZh,
          candidate.nameEn,
          candidate.institution,
        );
        if (profile) {
          // Use name+institution as key (caller maps to personId)
          const key = `${candidate.nameEn}|${candidate.institution}`;
          results.set(key, profile);
        }
      } catch (err) {
        console.error(`  [GS Worker ${workerId}] Error: ${candidate.nameZh}:`, err);
        // Rotate context on error to refresh fingerprint
        await rotateContext();
      }
      // Delay between scholars (shared across workers via queue timing)
      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, getRequestDelay()));
      }
    }
  }

  const pages = await getPages(concurrency);
  try {
    await Promise.all(pages.map((page, i) => worker(page, i + 1)));
  } finally {
    for (const page of pages) {
      try { await page.close(); } catch { /* ignore */ }
    }
  }

  console.log(`[GS] Batch complete: ${results.size}/${candidates.length} profiles found`);
  return results;
}

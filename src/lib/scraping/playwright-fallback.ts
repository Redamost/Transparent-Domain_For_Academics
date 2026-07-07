// ─── Playwright Fallback Scraper ───
// JS-rendered page fallback for cn-university.ts.
// When the HTTP scraper gets 0 profile links or empty content,
// this module uses Playwright (Chromium) to render and extract.
//
// Uses system Microsoft Edge (Chromium-based) — no extra install needed on Windows.
//
// NOTE: Playwright is imported dynamically to prevent Turbopack from
// resolving its internal require() chain (chromium-bidi, etc.) at build time.

import type { Browser, Page } from 'playwright';

// ─── Shared Browser ───

let _browser: Browser | null = null;
let _browserInitPromise: Promise<Browser> | null = null;

async function getChromium() {
  const { chromium } = await import('playwright');
  return chromium;
}

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  if (_browserInitPromise) return _browserInitPromise;

  const chromium = await getChromium();
  _browserInitPromise = chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  }).then((b) => {
    _browser = b;
    _browserInitPromise = null;
    return b;
  }).catch((err) => {
    _browserInitPromise = null;
    console.error('[Playwright] Failed to launch browser:', err.message);
    throw err;
  });

  return _browserInitPromise;
}

async function createPage(): Promise<Page> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1366, height: 768 },
  });
  return context.newPage();
}

/**
 * Close the shared browser instance. Call during graceful shutdown.
 */
export async function closePlaywrightBrowser(): Promise<void> {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

// ─── Link Discovery ───

/**
 * Use Playwright to discover profile links from a JS-rendered list page.
 * Returns an array of { href, text } objects.
 */
export async function discoverLinksWithPlaywright(
  listUrl: string,
  options?: { timeout?: number; waitAfterLoad?: number },
): Promise<Array<{ href: string; text: string }>> {
  const timeout = options?.timeout || 30000;
  const waitMs = options?.waitAfterLoad || 3000;

  let page: Page | null = null;
  try {
    page = await createPage();
    await page.goto(listUrl, { waitUntil: 'networkidle', timeout });
    await page.waitForTimeout(waitMs);

    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      const result: Array<{ href: string; text: string }> = [];
      const seen = new Set<string>();

      for (const a of anchors) {
        const href = (a.getAttribute('href') || '').trim();
        const text = (a.textContent || '').trim();
        if (!href || !text) continue;

        // Skip javascript: links, anchors, mailto
        if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) continue;

        // Deduplicate by href
        const normalized = href.split('?')[0].split('#')[0];
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        result.push({ href, text });
      }
      return result;
    });

    console.log(`[Playwright] Discovered ${links.length} links from ${listUrl}`);
    return links;
  } finally {
    if (page) {
      try { await page.context().close(); } catch {}
    }
  }
}

/**
 * List-page navigation text tokens that indicate non-profile links.
 * Used to filter navigation from profile links.
 */
const NAV_TEXT_SKIP = new Set([
  '首页', '更多', '查看', '下一页', '上一页', 'English', 'ENGLISH',
  '返回', '关闭', '打印', '推荐', '分享', '收藏',
  '师资队伍', '人才招聘', '联系我们', '网站地图', '版权信息',
]);

/**
 * Regex patterns for profile links — matches against both href path and link text.
 */
const PROFILE_LINK_PATTERNS = [
  /\/info\/\d+\/\d+\.htm/i,
  /\/[\w-]+\/\d+\.html?/i,
  /\/\d{4,}\/\d{4,}\.html?/i,
  /\/teacher\//i,
  /\/faculty\//i,
  /\/szdw\//i,
  /\/person\//i,
  /\/people\//i,
  /\/profile\//i,
  /\/member\//i,
  /\/staff\//i,
  /\/tutors?\//i,
  /\/scholar\//i,
  /\/researcher\//i,
  /\/academic\//i,
  /\/jsxx\//i,
  /\/jsdw\//i,
  /\/grxx\//i,
  /\/content\.jsp\?/i,
  /\/view\.jsp\?/i,
];

/**
 * Filter discovered links to those likely pointing to individual profile pages.
 */
function filterProfileLinks(
  links: Array<{ href: string; text: string }>,
): Array<{ href: string; text: string }> {
  return links.filter((l) => {
    // Skip navigation text
    if (NAV_TEXT_SKIP.has(l.text)) return false;

    // Skip long text (likely descriptions, not names/links)
    if (l.text.length > 30) return false;

    // Text must contain at least one CJK character
    if (!/[一-鿿]/.test(l.text)) return false;

    // Match against known profile URL patterns
    for (const pattern of PROFILE_LINK_PATTERNS) {
      if (pattern.test(l.href) || pattern.test(l.text)) return true;
    }

    // Fallback: short Chinese text (2-5 chars) that looks like a name
    if (/^[一-鿿·]{2,5}$/.test(l.text.trim())) return true;

    return false;
  });
}

// ─── Page Content Fetching ───

/**
 * Use Playwright to fetch and render a JS-heavy page, returning the rendered HTML.
 */
export async function fetchWithPlaywright(
  url: string,
  options?: { timeout?: number; waitAfterLoad?: number },
): Promise<string> {
  const timeout = options?.timeout || 20000;
  const waitMs = options?.waitAfterLoad || 2000;

  let page: Page | null = null;
  try {
    page = await createPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout });
    await page.waitForTimeout(waitMs);
    return await page.content();
  } finally {
    if (page) {
      try { await page.context().close(); } catch {}
    }
  }
}

/**
 * Full scrape of a university using Playwright for both list discovery and profile fetching.
 * Returns the same profiles array that scrapeUniversity() would, plus basic stats.
 */
export async function scrapeUniversityWithPlaywright(
  universityKey: string,
  listUrls: string[],
  maxProfiles: number,
): Promise<{
  profiles: Array<{
    nameZh: string;
    nameEn?: string;
    title?: string;
    department?: string;
    email?: string;
    bio?: string;
    website: string;
    institution: string;
  }>;
  stats: {
    key: string;
    listUrlsAttempted: number;
    listUrlsSucceeded: number;
    profileLinksDiscovered: number;
    profilesParsed: number;
    profilesFailed: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errors: any[];
    durationMs: number;
  };
}> {
  const startTime = Date.now();
  const stats = {
    key: universityKey,
    listUrlsAttempted: listUrls.length,
    listUrlsSucceeded: 0,
    profileLinksDiscovered: 0,
    profilesParsed: 0,
    profilesFailed: 0,
    errors: [] as Array<{ url: string; message: string }>,
    durationMs: 0,
  };

  const allProfileLinks: Array<{ href: string; text: string }> = [];

  // Phase 1: Discover profile links from all list pages
  for (const listUrl of listUrls) {
    try {
      const rawLinks = await discoverLinksWithPlaywright(listUrl);
      const profileLinks = filterProfileLinks(rawLinks);
      console.log(
        `[Playwright] ${listUrl}: ${rawLinks.length} raw links → ${profileLinks.length} profile links`,
      );
      stats.listUrlsSucceeded++;
      allProfileLinks.push(...profileLinks);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push({ url: listUrl, message: msg });
      console.error(`[Playwright] Failed to discover links from ${listUrl}: ${msg}`);
    }
  }

  stats.profileLinksDiscovered = allProfileLinks.length;

  // Deduplicate by href (normalized)
  const seen = new Set<string>();
  const uniqueLinks = allProfileLinks.filter((l) => {
    const key = l.href.split('?')[0].split('#')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(
    `[Playwright] ${uniqueLinks.length} unique profile links (from ${allProfileLinks.length} raw)`,
  );

  // Phase 2: Fetch and parse each profile
  const profiles: Array<{
    nameZh: string;
    nameEn?: string;
    title?: string;
    department?: string;
    email?: string;
    bio?: string;
    website: string;
    institution: string;
  }> = [];

  const toFetch = uniqueLinks.slice(0, maxProfiles);
  let page: Page | null = null;

  try {
    page = await createPage();

    for (const link of toFetch) {
      try {
        // Resolve relative URLs
        let profileUrl = link.href;
        if (profileUrl.startsWith('/')) {
          const url = new URL(listUrls[0]);
          profileUrl = `${url.protocol}//${url.host}${profileUrl}`;
        } else if (!profileUrl.startsWith('http')) {
          const base = listUrls[0].replace(/\/[^/]*$/, '/');
          profileUrl = base + profileUrl;
        }

        await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1500);

        const html = await page.content();

        // Quick extraction of key fields from rendered HTML
        const fields = await page.evaluate(() => {
          const body = document.body.innerText || '';

          // Name from title
          const title = document.title.replace(/[-|—–\s].*$/, '').trim();

          // Email
          const emailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          const email = emailMatch ? emailMatch[1].toLowerCase() : undefined;

          // Title (academic rank)
          const rankMatch = body.match(/(?:教授|副教授|助理教授|讲师|研究员|副研究员|助理研究员|工程师|高级工程师|院士|博导|硕导)/);
          const rank = rankMatch ? rankMatch[0] : undefined;

          // Department
          const deptPatterns = [
            /(?:学院|系别|院系|所属单位|所在单位|部门)[：:]\s*([^\s,，]{2,20})/,
            /(?:计算机|软件|电子|信息|数学|物理|化学|生物|材料|机械|土木|环境|经济|管理|法学|哲学|历史|文学|外语|艺术|教育|医学|药学|农学)[^\s]{0,10}(?:学院|系|研究所|中心)/,
          ];
          let department: string | undefined;
          for (const p of deptPatterns) {
            const m = body.match(p);
            if (m) { department = m[0]; break; }
          }

          // Bio text
          const cleaned = body.replace(/\s+/g, ' ').trim();
          const bioMatch = cleaned.match(
            /(?:个人简介|教师简介|研究方向|研究领域|教育背景|工作经历)[：:]\s*([\s\S]{20,500}?)(?:联系方式|招生|研究方向|发表论文|科研项目|获奖|主讲课程)/,
          );
          const bio = bioMatch ? bioMatch[1].trim().slice(0, 2000) : cleaned.slice(0, 500);

          return { title: title || undefined, email, rank, department, bio };
        });

        const nameZh = fields.title || link.text;

        profiles.push({
          nameZh,
          nameEn: undefined,
          title: fields.rank,
          department: fields.department,
          email: fields.email,
          bio: fields.bio,
          website: profileUrl,
          institution: universityKey,
        });

        stats.profilesParsed++;
      } catch (err) {
        stats.profilesFailed++;
        const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
        // Don't log every single failure — too noisy
        if (stats.profilesFailed <= 3) {
          console.warn(`[Playwright] Profile fetch failed: ${msg}`);
        }
      }

      // Rate limit between profiles
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    if (page) {
      try { await page.context().close(); } catch {}
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(
    `[Playwright] ${universityKey}: ${stats.profilesParsed} profiles (${stats.profilesFailed} failed) in ${(stats.durationMs / 1000).toFixed(1)}s`,
  );

  return { profiles, stats };
}

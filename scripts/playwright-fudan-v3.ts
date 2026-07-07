// Fudan Playwright V3 — use click-based pagination
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { mergePersonSources } from '../src/lib/scraping/normalizer';
import { deduplicatePerson } from '../src/lib/scraping/deduplicator';
import { isValidScrapedPerson } from '../src/lib/scraping/name-validator';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

const BASE_URL = 'https://cs.fudan.edu.cn';
const LIST_URL = `${BASE_URL}/szdw/list.htm`;

async function main() {
  console.log('=== Fudan CS Playwright Scraper V3 (click pagination) ===\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // ─── COLLECT ALL TEACHER LINKS ───
  const teacherLinks: Array<{ url: string; nameZh: string }> = [];
  const seenUrls = new Set<string>();

  await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  for (let pageNum = 1; pageNum <= 14; pageNum++) {
    console.log(`\nPage ${pageNum}...`);

    // Extract teacher links with the CMS pattern
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      const results: Array<{ href: string; text: string }> = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();
        if (/\/[a-z0-9]+\/[a-z0-9]+\/c\d+[a-z0-9]*\/page\.htm/.test(href)) {
          results.push({ href, text });
        }
      }
      return results;
    });

    let newCount = 0;
    for (const l of links) {
      let url = l.href;
      if (url.startsWith('/')) url = BASE_URL + url;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      teacherLinks.push({ url, nameZh: l.text });
      newCount++;
    }

    console.log(`  New links: ${newCount}, Total unique: ${teacherLinks.length}`);

    if (pageNum >= 14) break;

    // Click "下一页" (Next Page)
    try {
      const nextLink = page.locator('a:has-text("下一页")').first();
      if (await nextLink.isVisible({ timeout: 3000 })) {
        await nextLink.click();
        await page.waitForTimeout(2500);
        await page.waitForLoadState('networkidle').catch(() => {});
      } else {
        console.log('  "下一页" not visible, stopping pagination');
        break;
      }
    } catch {
      console.log('  Could not click next page, stopping');
      break;
    }
  }

  console.log(`\n\nTotal unique teacher profiles: ${teacherLinks.length}`);

  // ─── VISIT EACH PROFILE ───
  console.log('\n=== Visiting profile pages ===');
  let inserted = 0, updated = 0, skipped = 0;

  for (let i = 0; i < teacherLinks.length; i++) {
    const { url, nameZh } = teacherLinks[i];

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      const html = await page.content();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Name from title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      let name = nameZh;
      if (titleMatch) {
        const nameFromTitle = titleMatch[1].trim().match(/^([一-鿿]{2,4})/);
        if (nameFromTitle) name = nameFromTitle[1];
      }

      if (!/^[一-鿿]{2,4}$/.test(name)) { skipped++; continue; }

      const titleM = text.match(/(教授|副教授|讲师|研究员|副研究员|工程师|助理教授)/);
      const title = titleM ? titleM[1] : undefined;
      const emailM = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const email = emailM ? emailM[1].toLowerCase() : undefined;
      const deptM = text.match(/(?:学院|系别|院系|所属单位)[：:]\s*([^\s,，]{2,20})/);
      const department = deptM ? deptM[1] : undefined;
      const bioM = text.match(/(?:研究方向|研究领域|个人简介|教师简介)[：:]\s*([\s\S]{20,500}?)(?:教育背景|工作经历|联系方式|招生)/);
      const bio = bioM ? bioM[1].trim().slice(0, 1000) : undefined;

      const profile = {
        sourceId: url, source: 'CN_UNIVERSITY' as const,
        nameZh: name, nameEn: null, alternativeNames: [] as string[],
        title: title || null, institution: '复旦大学', department: department || null,
        email: email || null, website: url, sourceUrl: url, avatarUrl: null, bio: bio || null,
        hIndex: null, citationCount: null, publicationCount: null, fields: [] as string[],
        publications: [], researchUpdates: [], competitionUpdates: [], evaluationUpdates: [],
        rawMetadata: { universityKey: 'fudan', sourceUrl: url },
      };

      const nameCheck = isValidScrapedPerson({ nameZh: profile.nameZh, nameEn: profile.nameEn, institution: profile.institution });
      if (!nameCheck.valid) { skipped++; continue; }

      const normalized = mergePersonSources([profile]);
      const dedupResult = await deduplicatePerson(normalized);

      if (dedupResult.matched && dedupResult.existingPersonId) {
        await prisma.person.update({
          where: { id: dedupResult.existingPersonId },
          data: { email: profile.email || undefined, department: profile.department || undefined, website: profile.website || undefined, bioZh: profile.bio || undefined, title: profile.title || undefined, lastScrapedAt: new Date() },
        });
        updated++;
      } else {
        await prisma.$transaction(async (tx) => {
          const created = await tx.person.create({
            data: {
              nameZh: normalized.nameZh || profile.nameZh, title: normalized.title,
              institution: normalized.institution, department: normalized.department,
              email: normalized.email, website: normalized.website, bioZh: normalized.bio,
              hIndex: null, citationCount: null, publicationCount: normalized.publicationCount,
              lastScrapedAt: new Date(), isVerified: false,
              metadata: { source: 'CN_UNIVERSITY', confidence: 0.6, scrapedAt: new Date().toISOString() },
            },
          });
          await initializeScoreBreakdowns(tx, created.id);
        });
        inserted++;
      }

      if ((i + 1) % 30 === 0) console.log(`  [${i+1}/${teacherLinks.length}] ${name} | ins:${inserted} upd:${updated}`);

    } catch { skipped++; }
    await page.waitForTimeout(500);
  }

  await context.close();
  await browser.close();

  console.log(`\n=== DONE: ${inserted} new, ${updated} updated, ${skipped} skipped ===`);
  const fudanTotal = await prisma.person.count({ where: { institution: '复旦大学', isActive: true } });
  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`Fudan: ${fudanTotal} | Total DB: ${dbTotal}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

// Fudan Playwright scraper V2 — correctly extracting teacher profile links
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { mergePersonSources } from '../src/lib/scraping/normalizer';
import { deduplicatePerson } from '../src/lib/scraping/deduplicator';
import { isValidScrapedPerson } from '../src/lib/scraping/name-validator';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

const BASE_URL = 'https://cs.fudan.edu.cn';

async function main() {
  console.log('=== Fudan CS Playwright Scraper V2 ===\n');

  // Clean up Fudan junk from the failed V1 run
  const junkDeleted = await prisma.person.updateMany({
    where: {
      institution: '复旦大学',
      isActive: true,
      OR: [
        { nameZh: { in: ['培養方案', '課程建設', '學位申請', '非全專碩', '教學成果', '精品課程', '一流課程', '教學成果獎', '課程思政', '建設成果'] } },
        { nameZh: { startsWith: '教' } },
        { nameZh: { startsWith: '课' } },
        { nameZh: { startsWith: '建' } },
        { nameZh: { startsWith: '非' } },
        { nameZh: { startsWith: '一' } },
        { nameZh: { startsWith: '学' } },
        { nameZh: { startsWith: '精' } },
        { nameZh: { startsWith: '相' } },
      ],
    },
    data: { isActive: false, metadata: { deactivated: true, reason: 'fudan_v1_junk', deactivatedAt: new Date().toISOString() } },
  });
  console.log(`Cleaned up ${junkDeleted.count} junk Fudan entries from V1`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // ─── COLLECT TEACHER PROFILE LINKS ───
  const teacherLinks: Array<{ url: string; nameZh: string }> = [];
  const seen = new Set<string>();

  for (let pageNum = 1; pageNum <= 14; pageNum++) {
    const pageUrl = pageNum === 1
      ? `${BASE_URL}/szdw/list.htm`
      : `${BASE_URL}/szdw/list.htm?page=${pageNum}`;

    console.log(`Page ${pageNum}: ${pageUrl}`);
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);
    } catch {
      console.log(`  Failed, stopping pagination`);
      break;
    }

    // Extract teacher profile links: look for <a> tags with href matching the CMS pattern
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      const results: Array<{ href: string; text: string }> = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();
        // Target: links matching CMS profile URL pattern like /5b/fa/c30604a482298/page.htm
        if (/\/[a-z0-9]+\/[a-z0-9]+\/c\d+[a-z0-9]*\/page\.htm/.test(href)) {
          results.push({ href, text });
        }
      }
      return results;
    });

    for (const l of links) {
      let url = l.href;
      if (url.startsWith('/')) url = BASE_URL + url;
      if (seen.has(url)) continue;
      seen.add(url);
      teacherLinks.push({ url, nameZh: l.text });
    }

    console.log(`  Found ${links.length} teacher links on this page (total: ${teacherLinks.length})`);

    // Check for next page
    const hasNext = await page.evaluate(() => document.body.innerText.includes('下一页'));
    if (!hasNext && pageNum > 1) break;

    await page.waitForTimeout(1000);
  }

  console.log(`\nTotal unique teacher profiles: ${teacherLinks.length}`);

  // ─── VISIT EACH PROFILE ───
  let inserted = 0, updated = 0, skipped = 0;

  for (let i = 0; i < teacherLinks.length; i++) {
    const { url, nameZh } = teacherLinks[i];
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1200);

      const html = await page.content();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const titleText = titleMatch ? titleMatch[1].trim() : '';

      // Name: prefer from title, fallback to link text
      let name = nameZh;
      const nameFromTitle = titleText.match(/^([一-鿿]{2,4})/);
      if (nameFromTitle) name = nameFromTitle[1];

      // Skip non-names
      if (!/^[一-鿿]{2,4}$/.test(name)) { skipped++; continue; }

      // Title
      const titleM = text.match(/(教授|副教授|讲师|研究员|副研究员|工程师|高级工程师|助理教授)/);
      const title = titleM ? titleM[1] : undefined;

      // Department
      const deptM = text.match(/(?:学院|系别|院系|所属单位|所在单位)[：:]\s*([^\s,，]{2,20})/);
      const department = deptM ? deptM[1] : undefined;

      // Email
      const emailM = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const email = emailM ? emailM[1].toLowerCase() : undefined;

      // Bio
      let bio: string | undefined;
      const bioM = text.match(/(?:研究方向|研究领域|个人简介|教师简介)[：:]\s*([\s\S]{20,800}?)(?:教育背景|工作经历|联系方式|招生|论文|科研|发表)/);
      if (bioM) {
        bio = bioM[1].trim().slice(0, 1000);
      }

      const profile = {
        sourceId: url,
        source: 'CN_UNIVERSITY' as const,
        nameZh: name,
        nameEn: null,
        alternativeNames: [] as string[],
        title: title || null,
        institution: '复旦大学',
        department: department || null,
        email: email || null,
        website: url,
        sourceUrl: url,
        avatarUrl: null,
        bio: bio || null,
        hIndex: null,
        citationCount: null,
        publicationCount: null,
        fields: [] as string[],
        publications: [],
        researchUpdates: [],
        competitionUpdates: [],
        evaluationUpdates: [],
        rawMetadata: { universityKey: 'fudan', sourceUrl: url },
      };

      const nameCheck = isValidScrapedPerson({
        nameZh: profile.nameZh,
        nameEn: profile.nameEn,
        institution: profile.institution,
      });

      if (!nameCheck.valid) { skipped++; continue; }

      const normalized = mergePersonSources([profile]);
      const dedupResult = await deduplicatePerson(normalized);

      if (dedupResult.matched && dedupResult.existingPersonId) {
        await prisma.person.update({
          where: { id: dedupResult.existingPersonId },
          data: {
            email: profile.email || undefined,
            department: profile.department || undefined,
            website: profile.website || undefined,
            bioZh: profile.bio || undefined,
            title: profile.title || undefined,
            lastScrapedAt: new Date(),
          },
        });
        updated++;
      } else {
        await prisma.$transaction(async (tx) => {
          const created = await tx.person.create({
            data: {
              nameZh: normalized.nameZh || profile.nameZh,
              title: normalized.title,
              institution: normalized.institution,
              department: normalized.department,
              email: normalized.email,
              website: normalized.website,
              bioZh: normalized.bio,
              hIndex: null, citationCount: null,
              publicationCount: normalized.publicationCount,
              lastScrapedAt: new Date(),
              isVerified: false,
              metadata: { source: 'CN_UNIVERSITY', confidence: 0.6, scrapedAt: new Date().toISOString() },
            },
          });
          await initializeScoreBreakdowns(tx, created.id);
        });
        inserted++;
      }

      if ((i + 1) % 20 === 0) console.log(`  [${i+1}/${teacherLinks.length}] ${name} — ${title || '?'} | inserted:${inserted} updated:${updated}`);

    } catch (err) {
      // skip
    }

    await page.waitForTimeout(600);
  }

  await context.close();
  await browser.close();

  console.log(`\n=== DONE ===`);
  console.log(`Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);
  const total = await prisma.person.count({ where: { isActive: true } });
  const fudanTotal = await prisma.person.count({ where: { institution: '复旦大学', isActive: true } });
  console.log(`Fudan in DB: ${fudanTotal} | Total in DB: ${total}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

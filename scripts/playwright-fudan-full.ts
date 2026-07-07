// Full Playwright scraper for Fudan CS (188 teachers, 14 pages)
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
  console.log('=== Fudan CS Playwright Scraper ===\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // Collect teacher profile URLs from all pages
  const profileUrls: Array<{ url: string; nameZh: string }> = [];
  const seen = new Set<string>();

  for (let pageNum = 1; pageNum <= 14; pageNum++) {
    const pageUrl = pageNum === 1 ? LIST_URL : `${LIST_URL.replace('.htm', '')}/page/${pageNum}.htm`;

    console.log(`Page ${pageNum}/14: ${pageUrl}`);
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);
    } catch {
      // Try alternate pagination pattern
      try {
        const altUrl = `${LIST_URL}?page=${pageNum}`;
        await page.goto(altUrl, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(2000);
      } catch {
        console.log(`  Failed to load page ${pageNum}, stopping pagination`);
        break;
      }
    }

    // Extract teacher links
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      const result: Array<{ href: string; text: string }> = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();
        // Filter: must have CJK text, be short-ish
        if (href && text && /[一-鿿]/.test(text) && text.length >= 2 && text.length <= 8) {
          result.push({ href, text });
        }
      }
      return result;
    });

    // Filter to likely teacher names (skip nav, dates, etc.)
    const navWords = ['首页', '下一页', '上一页', '尾页', '第一页', '跳转', '个人中心', '教职工版本', '当前位置', '版权所有', '地址', '电话', '更多'];
    for (const l of links) {
      if (navWords.some(w => l.text.includes(w))) continue;
      if (/^\d/.test(l.text)) continue; // Skip dates
      if (!/^[一-鿿A-Za-z]/.test(l.text)) continue; // Must start with CJK or letter
      if (l.text.includes('@')) continue; // Skip email addresses

      let url = l.href;
      if (url.startsWith('/')) url = BASE_URL + url;
      else if (!url.startsWith('http')) url = `${BASE_URL}/szdw/${url}`;

      if (seen.has(url)) continue;
      seen.add(url);

      profileUrls.push({ url, nameZh: l.text });
    }

    console.log(`  Found ${profileUrls.length} unique profile URLs so far`);

    // Check if we've reached the last page
    const hasNextPage = await page.evaluate(() => {
      return document.body.innerText.includes('下一页');
    });
    if (!hasNextPage && pageNum > 1) {
      console.log(`  No more pages, stopping`);
      break;
    }

    // Small delay between pages
    await page.waitForTimeout(1000);
  }

  console.log(`\nTotal unique profile URLs: ${profileUrls.length}`);

  // Visit each profile page and extract details
  let inserted = 0, updated = 0, rejected = 0;

  for (let i = 0; i < profileUrls.length; i++) {
    const { url, nameZh } = profileUrls[i];
    console.log(`[${i+1}/${profileUrls.length}] ${nameZh} — ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      const html = await page.content();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Extract fields
      const titleMatch = text.match(/(教授|副教授|讲师|研究员|副研究员|工程师|高级工程师|助理教授)/);
      const title = titleMatch ? titleMatch[1] : undefined;

      const deptMatch = text.match(/(?:学院|系别|院系|所属单位|所在单位|部门)[：:]\s*([^\s,，]{2,20})/);
      const department = deptMatch ? deptMatch[1] : undefined;

      const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const email = emailMatch ? emailMatch[1].toLowerCase() : undefined;

      // Bio: look for research direction or personal intro
      let bio: string | undefined;
      const bioMatch = text.match(/(?:研究方向|研究领域|个人简介|教师简介|个人简历)[：:]\s*([\s\S]{20,800}?)(?:教育背景|工作经历|联系方式|招生|论文|科研|发表)/);
      if (bioMatch) {
        bio = bioMatch[1].trim().slice(0, 1000);
      } else {
        // Take first substantial paragraph after name
        const nameIdx = text.indexOf(nameZh);
        if (nameIdx >= 0) {
          const afterName = text.slice(nameIdx + nameZh.length);
          const blockMatch = afterName.match(/([\s\S]{80,800})/);
          if (blockMatch) {
            const block = blockMatch[1].trim();
            const chineseRatio = (block.match(/[一-鿿]/g) || []).length / block.length;
            if (chineseRatio > 0.3) bio = block.slice(0, 1000);
          }
        }
      }

      // Build scraped profile
      const profile = {
        sourceId: url,
        source: 'CN_UNIVERSITY' as const,
        nameZh,
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

      // Validate
      const nameCheck = isValidScrapedPerson({
        nameZh: profile.nameZh,
        nameEn: profile.nameEn,
        institution: profile.institution,
      });

      if (!nameCheck.valid) {
        console.log(`  REJECTED: ${nameCheck.reason}`);
        rejected++;
        continue;
      }

      // Persist
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
            lastScrapedAt: new Date(),
          },
        });
        console.log(`  UPDATED (existing)`);
        updated++;
      } else {
        await prisma.$transaction(async (tx) => {
          const created = await tx.person.create({
            data: {
              nameZh: normalized.nameZh || profile.nameZh,
              nameEn: normalized.nameEn,
              alternativeNames: normalized.alternativeNames.length > 0 ? JSON.stringify(normalized.alternativeNames) : null,
              title: normalized.title,
              institution: normalized.institution,
              department: normalized.department,
              email: normalized.email,
              website: normalized.website,
              avatarUrl: normalized.avatarUrl,
              bioZh: normalized.bio,
              hIndex: null,
              citationCount: null,
              publicationCount: normalized.publicationCount,
              lastScrapedAt: new Date(),
              isVerified: false,
              metadata: { source: 'CN_UNIVERSITY', confidence: 0.6, scrapedAt: new Date().toISOString(), ...normalized.metadata },
            },
          });
          await initializeScoreBreakdowns(tx, created.id);
        });
        console.log(`  INSERTED`);
        inserted++;
      }

    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`);
    }

    // Delay between profiles
    await page.waitForTimeout(800);
  }

  await context.close();
  await browser.close();

  console.log(`\n=== DONE ===`);
  console.log(`Inserted: ${inserted}, Updated: ${updated}, Rejected: ${rejected}`);
  const total = await prisma.person.count({ where: { isActive: true } });
  console.log(`Total in DB: ${total}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

// Batch scrape remaining C9: HIT, USTC, XJTU
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

async function extractAndPersist(
  label: string,
  urls: string[],
  institution: string,
  options?: { useTitleAsDept?: boolean; clickNext?: boolean },
) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${label} — ${institution}`);
  console.log(`URLs: ${urls.join(', ')}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const allTeachers: Array<{ nameZh: string; department?: string; title?: string; email?: string; website?: string }> = [];
  const seen = new Set<string>();

  for (const url of urls) {
    console.log(`\n  Fetching: ${url}`);

    // Use the label as department if single page
    const deptFromUrl = options?.useTitleAsDept ? new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/\.htm.*$/, '') : undefined;

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    } catch {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {
        console.log('  FAILED');
        continue;
      }
    }
    await page.waitForTimeout(3000);

    const text = await page.evaluate(() => document.body.innerText);

    // Strategy 1: Extract teacher names near "教授|副教授|讲师|研究员" keywords
    const teacherPatterns = text.match(/([一-鿿]{2,4})\s*(?:教授|副教授|讲师|研究员|副研究员|工程师|助理教授|助理研究员|高工|博导|硕导)/g);
    if (teacherPatterns) {
      for (const m of teacherPatterns) {
        const name = m.match(/^([一-鿿]{2,4})/)?.[1];
        if (!name || seen.has(name)) continue;
        // Skip non-name text
        if (/学院|中心|研究|工程|技术|大学|实验室|研究所|学部|教学|计算|智能/.test(name) && name.length > 3) continue;
        seen.add(name);
        allTeachers.push({ nameZh: name, department: deptFromUrl });
      }
    }

    // Strategy 2: Extract from structured entries (XJTU-style: name, title, office, email)
    const emailMatches = text.matchAll(/([一-鿿]{2,4})\s*[\(（]([^)）]+)[\)）]\s*[\s\S]{0,200}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
    for (const m of emailMatches) {
      const name = m[1];
      const title = m[2].trim();
      const email = m[3].toLowerCase();
      if (!name || seen.has(name)) continue;
      seen.add(name);

      // Update existing or add new
      const existing = allTeachers.find(t => t.nameZh === name);
      if (existing) {
        existing.title = title;
        existing.email = email;
      } else {
        allTeachers.push({ nameZh: name, title, email, department: deptFromUrl });
      }
    }

    // Strategy 3: XJTU-style list with "了解详细" links
    const detailMatches = text.matchAll(/了解详细\s*\n?\s*([一-鿿]{2,4})\s*[\(（]([^)）]+)[\)）]\s*[\s\S]{0,300}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?/g);
    for (const m of detailMatches) {
      const name = m[1];
      const title = m[2]?.trim();
      const email = m[3]?.toLowerCase();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      allTeachers.push({ nameZh: name, title, email, department: deptFromUrl });
    }

    console.log(`  Found ${allTeachers.length} unique teachers so far`);

    // Try clicking "下一页" if available
    if (options?.clickNext) {
      for (let p = 2; p <= 5; p++) {
        try {
          const nextLink = page.locator('a:has-text("下一页")').first();
          if (await nextLink.isVisible({ timeout: 2000 })) {
            await nextLink.click();
            await page.waitForTimeout(2000);

            const moreText = await page.evaluate(() => document.body.innerText);
            const moreNames = moreText.match(/([一-鿿]{2,4})\s*(?:教授|副教授|讲师|研究员|工程师|助理教授)/g);
            if (moreNames) {
              for (const m of moreNames) {
                const name = m.match(/^([一-鿿]{2,4})/)?.[1];
                if (name && !seen.has(name) && !/学院|中心|研究|工程|技术|大学|实验室/.test(name)) {
                  seen.add(name);
                  allTeachers.push({ nameZh: name, department: deptFromUrl });
                }
              }
            }
          } else break;
        } catch { break; }
      }
    }
  }

  console.log(`\n  Total unique teachers: ${allTeachers.length}`);

  // ─── PERSIST ───
  let inserted = 0, updated = 0;
  for (const t of allTeachers) {
    const existing = await prisma.person.findFirst({
      where: { nameZh: t.nameZh, institution, isActive: true },
    });
    if (existing) {
      if ((t.email && !existing.email) || (t.title && !existing.title)) {
        await prisma.person.update({
          where: { id: existing.id },
          data: {
            email: t.email || undefined,
            title: t.title || undefined,
            department: t.department || undefined,
          },
        });
        updated++;
      }
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          nameZh: t.nameZh,
          institution,
          department: t.department,
          title: t.title,
          email: t.email,
          lastScrapedAt: new Date(),
          isVerified: false,
          metadata: { source: 'CN_UNIVERSITY', confidence: 0.5, scrapedAt: new Date().toISOString() },
        },
      });
      await initializeScoreBreakdowns(tx, created.id);
    });
    inserted++;
  }

  console.log(`  Saved: +${inserted} new, ~${updated} updated`);

  await ctx.close();
  await browser.close();

  return { inserted, updated };
}

async function main() {
  let totalInserted = 0;

  // ═══ HIT: 教师名录 ═══
  const hitResult = await extractAndPersist(
    'HIT',
    ['https://computing.hit.edu.cn/jsml/list.htm'],
    '哈尔滨工业大学',
  );
  totalInserted += hitResult.inserted;

  // ═══ USTC: Professor sub-categories ═══
  const ustcResult = await extractAndPersist(
    'USTC',
    [
      'https://cs.ustc.edu.cn/zgj_23225/list.htm',  // 正高级
      'https://cs.ustc.edu.cn/js_23235/list.htm',   // 教授
      'https://cs.ustc.edu.cn/trjs/list.htm',       // 特任教授
      'https://cs.ustc.edu.cn/fjs_23239/list.htm',  // 副教授
      'https://cs.ustc.edu.cn/trfyjy/list.htm',     // 特任副研究员
    ],
    '中国科学技术大学',
    { clickNext: true },
  );
  totalInserted += ustcResult.inserted;

  // ═══ XJTU: 讲师及其他 + try professor pages ═══
  const xjtuResult = await extractAndPersist(
    'XJTU',
    [
      'http://www.cs.xjtu.edu.cn/szdw/jsml/jsjqt.htm',  // 讲师及其他
      'http://www.cs.xjtu.edu.cn/szdw/bssds1.htm',       // 博士生导师
      'http://www.cs.xjtu.edu.cn/szdw/sssds.htm',        // 硕士生导师
    ],
    '西安交通大学',
  );
  totalInserted += xjtuResult.inserted;

  // ═══ SUMMARY ═══
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOTAL NEW: ${totalInserted}`);
  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`DB Total: ${dbTotal}`);

  // Per-institution counts
  for (const inst of ['哈尔滨工业大学', '中国科学技术大学', '西安交通大学']) {
    const c = await prisma.person.count({ where: { institution: inst, isActive: true } });
    console.log(`  ${inst}: ${c}`);
  }

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

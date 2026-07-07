// Quick scrape for 3 more reachable universities
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

async function scrapeOne(browser: any, name: string, key: string, urls: string[]): Promise<number> {
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  const page = await ctx.newPage();
  const seen = new Set<string>();
  const teachers: Array<{ nameZh: string; title?: string; email?: string }> = [];

  for (const url of urls) {
    console.log(`  ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    } catch {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }); } catch {
        console.log(`    ❌ Load failed`);
        continue;
      }
    }
    await page.waitForTimeout(3000);

    const text = await page.evaluate(() => document.body.innerText);
    if (text.length < 100) { console.log(`    ❌ Empty (${text.length} chars)`); continue; }
    console.log(`    Text: ${text.length} chars`);

    // Extract names from lines
    const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length >= 2 && l.length <= 5);
    for (const line of lines) {
      if (!/^[一-鿿]{2,4}$/.test(line)) continue;
      if (/^(?:首页|更多|下一页|上一页|English|师资|学院|中心|研究|教学|招生|新闻|通知|概况|简介|领导|管理|组织|教授|副教授|讲师|研究员|全部|按|查找)$/.test(line)) continue;
      if (!seen.has(line)) {
        seen.add(line);
        teachers.push({ nameZh: line });
      }
    }

    // Also get link text
    const linkNames = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => (a.textContent || '').trim())
        .filter((t: string) => /^[一-鿿]{2,4}$/.test(t));
    });
    for (const ln of linkNames) {
      if (!seen.has(ln)) {
        seen.add(ln);
        teachers.push({ nameZh: ln });
      }
    }
  }

  console.log(`    Found: ${teachers.length}`);

  // Save
  let inserted = 0;
  for (const t of teachers) {
    const existing = await prisma.person.findFirst({
      where: { nameZh: t.nameZh, institution: name, isActive: true },
    });
    if (existing) continue;
    await prisma.$transaction(async (tx: any) => {
      const created = await tx.person.create({
        data: {
          nameZh: t.nameZh,
          institution: name,
          email: t.email,
          title: t.title,
          lastScrapedAt: new Date(),
          isVerified: false,
          metadata: { source: 'CN_UNIVERSITY', confidence: 0.5, scrapedAt: new Date().toISOString(), universityKey: key },
        },
      });
      await initializeScoreBreakdowns(tx, created.id);
    });
    inserted++;
  }

  await ctx.close();
  return inserted;
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let totalInserted = 0;

  // 华南理工大学 — try alternative URLs
  console.log('\n=== 华南理工大学 ===');
  const scutResult = await scrapeOne(browser, '华南理工大学', 'scut', [
    'https://www2.scut.edu.cn/cs/',
    'https://www2.scut.edu.cn/cs/szdw/list.htm',
    'https://www2.scut.edu.cn/cs/szdw1/list.htm',
  ]);
  totalInserted += scutResult;

  // 同济大学 — try alternative URLs
  console.log('\n=== 同济大学 ===');
  const tongjiResult = await scrapeOne(browser, '同济大学', 'tongji', [
    'https://cs.tongji.edu.cn/',
    'https://cs.tongji.edu.cn/szdw/js.htm',
    'https://cs.tongji.edu.cn/szdw1.htm',
  ]);
  totalInserted += tongjiResult;

  // 华中科技大学 — try alternative URLs
  console.log('\n=== 华中科技大学 ===');
  const hustResult = await scrapeOne(browser, '华中科技大学', 'hust', [
    'http://cs.hust.edu.cn/',
    'http://cs.hust.edu.cn/szdw/szll.htm',
    'http://cs.hust.edu.cn/szdw1/szll.htm',
  ]);
  totalInserted += hustResult;

  await browser.close();
  console.log(`\nTotal new: ${totalInserted}`);
  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`DB Total: ${dbTotal}`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

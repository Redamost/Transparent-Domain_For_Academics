// SJTU: extract teacher names from rendered list page (no individual profile links)
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

async function main() {
  console.log('=== SJTU Teacher List Extraction ===\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  const page = await ctx.newPage();

  // Visit teacher directory
  const url = 'https://www.cs.sjtu.edu.cn/jiaoshiml.html';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Get full visible text
  const fullText = await page.evaluate(() => document.body.innerText);

  // Parse: find institute sections and extract teacher names
  // Pattern: Institute name → 所长/副所长 → teacher names
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Find the "教师名录" content section
  const startIdx = lines.findIndex(l => l.includes('按系所查找'));
  if (startIdx < 0) { console.log('Could not find teacher list section'); return; }

  // Parse institute sections
  interface Teacher {
    nameZh: string;
    institute: string;
  }

  const teachers: Teacher[] = [];
  let currentInstitute = '';
  let inTeacherSection = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    // Skip pagination/nav/filter lines
    if (/^(?:全部|按|查找|教师名录|首页|English|使用|当前|第\d|共\d|跳转)/.test(line)) continue;
    if (line.length < 2) continue;

    // Detect institute name (ends with "研究所" or "中心" or "研究院")
    if (/(?:研究所|中心|研究院|实验室)$/.test(line) && line.length >= 4 && line.length <= 30) {
      currentInstitute = line;
      inTeacherSection = true;
      continue;
    }

    if (!inTeacherSection || !currentInstitute) continue;

    // Skip 所长/副所长 administrative lines (but note the names after 所长/副所长)
    if (/^(?:所\s*长|副\s*所\s*长)/.test(line)) {
      // Extract names from this line too
      const namePart = line.replace(/^(?:所\s*长|副\s*所\s*长)[：:]\s*/, '');
      const names = namePart.split(/[\s、，,]+/).filter(n => /^[一-鿿]{2,4}$/.test(n));
      for (const name of names) {
        teachers.push({ nameZh: name, institute: currentInstitute });
      }
      continue;
    }

    // Regular teacher name line: 2-4 CJK characters (possibly with spaces)
    const trimmed = line.replace(/\s+/g, '');
    if (/^[一-鿿]{2,4}$/.test(trimmed)) {
      teachers.push({ nameZh: trimmed, institute: currentInstitute });
    } else if (/^[一-鿿]{2,3}\s+[一-鿿]{2,3}$/.test(line)) {
      // Name with space in middle (like "陈  榕")
      const name = line.replace(/\s+/g, '');
      if (/^[一-鿿]{2,4}$/.test(name)) {
        teachers.push({ nameZh: name, institute: currentInstitute });
      }
    }

    // Stop when we hit another major section
    if (/^(?:校友|新闻|办事|地址|版权|联系|友情)/.test(line)) break;
  }

  // Deduplicate by name
  const seen = new Set<string>();
  const unique = teachers.filter(t => {
    if (seen.has(t.nameZh)) return false;
    seen.add(t.nameZh);
    return true;
  });

  console.log(`Extracted ${teachers.length} raw names, ${unique.length} unique`);

  // Show sample
  const byInstitute: Record<string, string[]> = {};
  for (const t of unique) {
    (byInstitute[t.institute] ||= []).push(t.nameZh);
  }
  for (const [inst, names] of Object.entries(byInstitute).slice(0, 10)) {
    console.log(`  ${inst}: ${names.join(', ')}`);
  }

  // ─── PERSIST ───
  let inserted = 0;
  for (const t of unique) {
    // Check if already exists
    const existing = await prisma.person.findFirst({
      where: { nameZh: t.nameZh, institution: '上海交通大学', isActive: true },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          nameZh: t.nameZh,
          institution: '上海交通大学',
          department: t.institute,
          lastScrapedAt: new Date(),
          isVerified: false,
          metadata: { source: 'CN_UNIVERSITY', confidence: 0.5, scrapedAt: new Date().toISOString(), universityKey: 'sjtu' },
        },
      });
      await initializeScoreBreakdowns(tx, created.id);
    });
    inserted++;
  }

  console.log(`\nSaved ${inserted} new SJTU scholars`);

  // Also try gjjrc.html for more names
  console.log('\n=== Also checking 国家级人才 page ===');
  await page.goto('https://www.cs.sjtu.edu.cn/gjjrc.html', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const talentText = await page.evaluate(() => document.body.innerText);
  // Extract names from talent lists
  const talentNames = talentText.match(/[一-鿿]{2,4}(?:\s+[一-鿿]{2,4})?/g) || [];
  const talentUnique = [...new Set(talentNames.map(n => n.replace(/\s+/g, '')))].filter(n => /^[一-鿿]{2,4}$/.test(n));

  let talentInserted = 0;
  for (const name of talentUnique) {
    const existing = await prisma.person.findFirst({
      where: { nameZh: name, institution: '上海交通大学', isActive: true },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          nameZh: name,
          institution: '上海交通大学',
          lastScrapedAt: new Date(),
          isVerified: false,
          metadata: { source: 'CN_UNIVERSITY', confidence: 0.4, scrapedAt: new Date().toISOString(), universityKey: 'sjtu' },
        },
      });
      await initializeScoreBreakdowns(tx, created.id);
    });
    talentInserted++;
  }

  console.log(`Saved ${talentInserted} more from talent page`);

  await ctx.close();
  await browser.close();

  const sjtuTotal = await prisma.person.count({ where: { institution: '上海交通大学', isActive: true } });
  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nSJTU total: ${sjtuTotal} | DB total: ${dbTotal}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

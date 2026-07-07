// Direct scrape for BIT (北京理工大学)
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

const NAME_BLACKLIST = new Set([
  '学校首页', '学院概况', '机构设置', '师资队伍', '科学研究', '人才培养',
  '国际合作', '学生工作', '党建思政', '招生就业', '校友工作',
  '师资概况', '杰出人才', '教师名录', '导师名录', '招贤纳士',
  '博士生导师', '硕士生导师', '院士', '首页', 'English',
  '计算机学院', '软件学院', '网络空间安全', '实验教学中心', '评测中心',
  '党政领导', '治理机构', '管理服务', '机构概况', '历史沿革', '学院领导',
  '计算机系', '软件测评中心', '更多', '下一页', '上一页',
]);

function cleanName(name: string): string | null {
  name = name.trim();
  if (!name || name.length < 2 || name.length > 5) return null;
  if (!/^[一-鿿]+$/.test(name)) return null;
  if (NAME_BLACKLIST.has(name)) return null;
  return name;
}

async function scrapePage(page: any, url: string): Promise<string[]> {
  console.log(`  Loading: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }); } catch {
      console.log(`  ❌ Failed`);
      return [];
    }
  }
  await page.waitForTimeout(3000);

  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length >= 2 && l.length <= 5);

  const names: string[] = [];
  for (const line of lines) {
    const name = cleanName(line);
    if (name) names.push(name);
  }

  // Also find link text for names
  const linkNames = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => (a.textContent || '').trim())
      .filter(t => /^[一-鿿]{2,4}$/.test(t));
  });
  for (const ln of linkNames) {
    const name = cleanName(ln);
    if (name && !names.includes(name)) names.push(name);
  }

  return names;
}

async function main() {
  console.log('BIT (北京理工大学) direct scrape\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  const page = await ctx.newPage();

  // Page 1: Main teacher list
  const allNames: string[] = [];
  const names1 = await scrapePage(page, 'https://cs.bit.edu.cn/szdw/jsml/index.htm');
  allNames.push(...names1);
  console.log(`  Main page: ${names1.length} names`);

  // Try sub-pages
  const subPages = [
    'https://cs.bit.edu.cn/szdw/jsml/jcrc/ys/index.htm',
    'https://cs.bit.edu.cn/szdw/jsml2/syjxzx2/index.htm',
    'https://cs.bit.edu.cn/szdw/jsml2/pczx2/index.htm',
  ];
  for (const sp of subPages) {
    const names = await scrapePage(page, sp);
    allNames.push(...names);
    console.log(`  ${sp.split('/').pop()}: ${names.length} names`);
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = allNames.filter(n => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  console.log(`\n  Total unique: ${unique.length}`);

  // Save
  let inserted = 0;
  for (const name of unique) {
    const existing = await prisma.person.findFirst({
      where: { nameZh: name, institution: '北京理工大学', isActive: true },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          nameZh: name,
          institution: '北京理工大学',
          lastScrapedAt: new Date(),
          isVerified: false,
          metadata: { source: 'CN_UNIVERSITY', confidence: 0.5, scrapedAt: new Date().toISOString(), universityKey: 'bit' },
        },
      });
      await initializeScoreBreakdowns(tx, created.id);
    });
    inserted++;
  }

  console.log(`  Saved: +${inserted} new`);

  await ctx.close();
  await browser.close();

  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nDB Total: ${dbTotal}`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

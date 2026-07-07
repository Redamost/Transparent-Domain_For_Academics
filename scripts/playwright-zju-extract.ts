// ZJU: Extract teacher names from rendered directory + profile URLs
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

async function main() {
  console.log('=== ZJU Teacher Extraction ===\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  const page = await ctx.newPage();

  const url = 'http://www.cs.zju.edu.cn/csen/27003/list.htm';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  const text = await page.evaluate(() => document.body.innerText);

  // Extract teacher profile links (non-redirect CMS pattern: /csen/YYYY/MMDD/cXXXXXaXXXXXXX/page.htm)
  const profileLinks = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a');
    return Array.from(anchors)
      .filter(a => /\/csen\/\d{4}\/\d{4}\/c\d+a\d+\/page\.htm/.test(a.getAttribute('href') || ''))
      .map(a => ({
        href: a.getAttribute('href') || '',
        text: (a.textContent || '').trim(),
      }));
  });

  console.log(`Profile page links: ${profileLinks.length}`);
  for (const l of profileLinks.slice(0, 10)) {
    console.log(`  "${l.text}" → ${l.href}`);
  }

  // Extract teacher names from page text (similar to SJTU approach)
  // The page shows teachers organized by research group
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Find the teacher directory section
  const startIdx = lines.findIndex(l => l.includes('教师名录'));
  if (startIdx < 0) { console.log('Could not find section'); return; }

  interface Teacher { nameZh: string; institute: string; profileUrl: string | null; }
  const teachers: Teacher[] = [];
  let currentGroup = '';

  // Map of profile link text → URL
  const linkMap = new Map<string, string>();
  for (const l of profileLinks) {
    if (l.text) linkMap.set(l.text, l.href);
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 2) continue;
    if (/^(?:首页|English|办公网|个人中心|当前位置|师资|每页|总共|第一|上一|下一|尾页|页码|跳转|地址|联系|版权)/.test(line)) continue;

    // Detect research group names (longer names containing 研究 or specific text)
    if ((line.includes('研究') || line.includes('实验') || line.includes('中心')) && line.length >= 4 && line.length <= 30 && !/^[一-鿿]{2,4}$/.test(line)) {
      currentGroup = line;
      continue;
    }

    // Teacher name: 2-4 CJK
    if (/^[一-鿿]{2,4}$/.test(line)) {
      const profileUrl = linkMap.get(line) || null;
      teachers.push({ nameZh: line, institute: currentGroup, profileUrl });
    }
  }

  console.log(`\nExtracted ${teachers.length} teachers`);

  // Deduplicate
  const seen = new Set<string>();
  const unique = teachers.filter(t => {
    if (seen.has(t.nameZh)) return false;
    seen.add(t.nameZh);
    return true;
  });

  console.log(`Unique: ${unique.length}`);
  const withProfile = unique.filter(t => t.profileUrl);
  console.log(`With profile links: ${withProfile.length}`);

  // Group by institute
  const groups: Record<string, string[]> = {};
  for (const t of unique) {
    (groups[t.institute] ||= []).push(t.nameZh);
  }
  for (const [inst, names] of Object.entries(groups).slice(0, 8)) {
    console.log(`  ${inst}: ${names.slice(0, 8).join(', ')}${names.length > 8 ? '...' : ''}`);
  }

  // ─── PERSIST ───
  let inserted = 0;
  for (const t of unique) {
    const existing = await prisma.person.findFirst({
      where: { nameZh: t.nameZh, institution: '浙江大学', isActive: true },
    });
    if (existing) {
      // Update with profile URL if available
      if (t.profileUrl && !existing.website) {
        await prisma.person.update({ where: { id: existing.id }, data: { website: t.profileUrl } });
      }
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          nameZh: t.nameZh,
          institution: '浙江大学',
          department: t.institute || undefined,
          website: t.profileUrl || undefined,
          lastScrapedAt: new Date(),
          isVerified: false,
          metadata: { source: 'CN_UNIVERSITY', confidence: 0.5, scrapedAt: new Date().toISOString(), universityKey: 'zju' },
        },
      });
      await initializeScoreBreakdowns(tx, created.id);
    });
    inserted++;
  }

  console.log(`\nSaved ${inserted} new ZJU scholars`);

  // ─── VISIT PROFILE PAGES FOR MORE INFO ───
  console.log('\n=== Visiting profile pages for details ===');
  let updated = 0;

  for (let i = 0; i < Math.min(withProfile.length, 20); i++) {
    const t = withProfile[i];
    const profUrl = t.profileUrl!.startsWith('/')
      ? `http://www.cs.zju.edu.cn${t.profileUrl}`
      : t.profileUrl!;

    try {
      await page.goto(profUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      const profText = await page.evaluate(() => document.body.innerText);

      // Extract email
      const emailM = profText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const email = emailM ? emailM[1].toLowerCase() : null;

      // Extract title
      const titleM = profText.match(/(教授|副教授|讲师|研究员|副研究员|工程师|助理教授)/);
      const title = titleM ? titleM[1] : null;

      // Extract bio
      const bioM = profText.match(/(?:研究方向|研究领域|个人简介)[：:]\s*([\s\S]{20,500}?)(?:教育背景|工作经历|联系方式|发表论文)/);
      const bio = bioM ? bioM[1].trim().slice(0, 1000) : null;

      if (email || title || bio) {
        await prisma.person.updateMany({
          where: { nameZh: t.nameZh, institution: '浙江大学', isActive: true },
          data: {
            email: email || undefined,
            title: title || undefined,
            bioZh: bio || undefined,
          },
        });
        updated++;
        if (email) console.log(`  ${t.nameZh}: email=${email} title=${title}`);
      }
    } catch { /* skip */ }
    await page.waitForTimeout(800);
  }

  console.log(`Updated ${updated} profiles with details`);

  await ctx.close();
  await browser.close();

  const zjuTotal = await prisma.person.count({ where: { institution: '浙江大学', isActive: true } });
  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nZJU total: ${zjuTotal} | DB total: ${dbTotal}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

// Diagnostic + fix for remaining 8 universities with 0 data
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

interface FixTarget {
  key: string;
  name: string;
  homeUrl: string;  // Department homepage to look for faculty links
}

const FIX_TARGETS: FixTarget[] = [
  { key: 'hust', name: '华中科技大学', homeUrl: 'http://cs.hust.edu.cn/' },
  { key: 'tongji', name: '同济大学', homeUrl: 'https://cs.tongji.edu.cn/' },
  { key: 'sichuan', name: '四川大学', homeUrl: 'https://cs.scu.edu.cn/' },
  { key: 'bit', name: '北京理工大学', homeUrl: 'https://cs.bit.edu.cn/' },
  { key: 'lzu', name: '兰州大学', homeUrl: 'https://xxxy.lzu.edu.cn/' },
  { key: 'scut', name: '华南理工大学', homeUrl: 'https://www2.scut.edu.cn/cs/' },
  { key: 'bnu', name: '北京师范大学', homeUrl: 'https://ai.bnu.edu.cn/' },
  { key: 'nudt', name: '国防科技大学', homeUrl: 'https://www.nudt.edu.cn/' },
];

const NAME_BLACKLIST = new Set([
  '首页', 'English', 'ENGLISH', '旧版', '教授', '副教授', '讲师', '助理教授',
  '研究员', '副研究员', '高级工程师', '助理研究员', '博士后',
  '党政领导', '组织机构', '师资队伍', '杰出人才', '师资名单',
  '按职称检索', '团队现拥有', '在职教师', '兼职教授', '客座教授',
  '访问学者', '博士生导师', '硕士生导师', '教职工名录', '教师名录',
  '更多', '下一页', '上一页', '尾页', '跳转', '全部',
  '学院概况', '学科建设', '科学研究', '人才培养', '招生就业',
  '新闻中心', '通知公告', '学术动态', '学生工作', '党建工作',
  '联系我们', '联系方式', '版权信息', '地址', '邮编',
  '系所导航', '快速链接', '友情链接',
]);

function cleanName(nameZh: string): string | null {
  if (!nameZh || nameZh.length < 2 || nameZh.length > 5) return null;
  if (!/^[一-鿿]+$/.test(nameZh)) return null;
  if (NAME_BLACKLIST.has(nameZh)) return null;
  const prefixes = ['副主任', '主任', '副院长', '院长', '系主任', '副系主任', '党委书记', '党委副书记', '所长', '副所长'];
  for (const p of prefixes) {
    if (nameZh.startsWith(p) && nameZh.length > p.length + 1) {
      nameZh = nameZh.slice(p.length);
      break;
    }
  }
  nameZh = nameZh.replace(/(?:教授|副教授|讲师|研究员|副研究员|高级工程师|工程师|助理教授|博士后|博导|硕导)$/, '');
  if (nameZh.length < 2 || nameZh.length > 4) return null;
  if (!/^[一-鿿]{2,4}$/.test(nameZh)) return null;
  return nameZh;
}

function isNavText(text: string): boolean {
  return /^(?:首页|更多|下一页|上一页|English|办公网|个人中心|当前位置|师资|每页|总共|第一|尾页|页码|跳转|地址|联系|版权|学校|首页|概况|简介|领导|管理|组织|学院|中心|研究|教学|招生|新闻|通知|下载|综合|全部|按|查找|使用|当前|第\d|共\d)/.test(text);
}

async function diagnoseAndFix(target: FixTarget): Promise<number> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${target.name} (${target.key}) — ${target.homeUrl}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  const page = await ctx.newPage();

  try {
    // Navigate to homepage
    console.log(`  Loading homepage...`);
    try {
      await page.goto(target.homeUrl, { waitUntil: 'networkidle', timeout: 25000 });
    } catch {
      try { await page.goto(target.homeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {
        console.log(`  ❌ Homepage failed to load`);
        return 0;
      }
    }
    await page.waitForTimeout(3000);

    // Find all links that look like faculty/teacher links
    const facultyLinks = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      const results: Array<{ href: string; text: string }> = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();
        // Look for faculty-related links
        if (/师资|教师|教工|faculty|teacher|导师|人才|szdw|szll|jsml|jyxl|Faculty/i.test(text + href)) {
          results.push({ href, text });
        }
      }
      return results;
    });

    console.log(`  Faculty-related links: ${facultyLinks.length}`);
    for (const l of facultyLinks.slice(0, 10)) {
      console.log(`    "${l.text}" → ${l.href.slice(0, 120)}`);
    }

    // Try to navigate to the most promising faculty list link
    let bestLink = '';
    for (const l of facultyLinks) {
      const combined = l.text + l.href;
      if (/师资队伍|教师名录|教师列表|szdw|jsml|jyxl|Faculty.*Staff/i.test(combined)) {
        bestLink = l.href;
        break;
      }
    }
    // Fallback: first link with 师资 or 教师
    if (!bestLink) {
      for (const l of facultyLinks) {
        if (/师资|教师/.test(l.text)) { bestLink = l.href; break; }
      }
    }

    // Navigate to the faculty list if found
    if (bestLink) {
      const fullUrl = bestLink.startsWith('http') ? bestLink
        : bestLink.startsWith('/') ? `https://${new URL(target.homeUrl).host}${bestLink}`
        : `${target.homeUrl}/${bestLink}`;

      console.log(`  → Navigating to: ${fullUrl}`);
      try {
        await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 20000 });
      } catch {
        try { await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {
          console.log(`  ❌ Faculty page failed`);
          return 0;
        }
      }
      await page.waitForTimeout(3000);
    }

    // Extract teacher names
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`  Text: ${text.length} chars, CJK: ${(text.match(/[一-鿿]/g)||[]).length}`);

    if (text.length < 100) {
      console.log(`  ❌ Near-empty page`);
      return 0;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const allTeachers: Array<{ nameZh: string; title?: string; email?: string }> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      if (isNavText(line)) continue;
      if (line.length > 60) continue;

      // Name + Title
      const nm = line.match(/^([一-鿿]{2,4})\s*(教授|副教授|讲师|研究员|副研究员|工程师|高级工程师|助理教授|助理研究员|高工|博导|硕导)/);
      if (nm) {
        const name = cleanName(nm[1]);
        if (name && !seen.has(name)) {
          seen.add(name);
          allTeachers.push({ nameZh: name, title: nm[2] });
        }
        continue;
      }

      // Standalone name
      if (/^[一-鿿]{2,4}$/.test(line)) {
        const name = cleanName(line);
        if (name && !seen.has(name)) {
          seen.add(name);
          allTeachers.push({ nameZh: name });
        }
      }
    }

    // Extract emails
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    let em;
    while ((em = emailRegex.exec(text)) !== null) {
      const email = em[1].toLowerCase();
      const context = text.slice(Math.max(0, em.index - 100), em.index);
      const nameInCtx = context.match(/([一-鿿]{2,4})/g);
      if (nameInCtx) {
        const lastName = nameInCtx[nameInCtx.length - 1];
        const name = cleanName(lastName);
        if (name) {
          const existing = allTeachers.find(t => t.nameZh === name);
          if (existing) existing.email = email;
          else if (!seen.has(name)) {
            seen.add(name);
            allTeachers.push({ nameZh: name, email });
          }
        }
      }
    }

    // Try clicking "下一页" for pagination
    for (let p = 2; p <= 6; p++) {
      try {
        const nextLink = page.locator('a:has-text("下一页")').first();
        if (await nextLink.isVisible({ timeout: 2000 })) {
          await nextLink.click();
          await page.waitForTimeout(2000);
          const moreText = await page.evaluate(() => document.body.innerText);
          const moreLines = moreText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          let moreFound = 0;
          for (const line of moreLines) {
            if (isNavText(line) || line.length > 60) continue;
            const nm = line.match(/^([一-鿿]{2,4})\s*(教授|副教授|讲师|研究员|副研究员|工程师|高级工程师|助理教授|助理研究员|高工)/);
            if (nm) {
              const name = cleanName(nm[1]);
              if (name && !seen.has(name)) {
                seen.add(name);
                allTeachers.push({ nameZh: name, title: nm[2] });
                moreFound++;
              }
            } else if (/^[一-鿿]{2,4}$/.test(line)) {
              const name = cleanName(line);
              if (name && !seen.has(name)) {
                seen.add(name);
                allTeachers.push({ nameZh: name });
                moreFound++;
              }
            }
          }
          if (moreFound === 0) break;
        } else break;
      } catch { break; }
    }

    console.log(`  Found ${allTeachers.length} teachers`);

    // PERSIST
    let inserted = 0;
    for (const t of allTeachers) {
      const existing = await prisma.person.findFirst({
        where: { nameZh: t.nameZh, institution: target.name, isActive: true },
      });
      if (existing) continue;
      await prisma.$transaction(async (tx) => {
        const created = await tx.person.create({
          data: {
            nameZh: t.nameZh,
            institution: target.name,
            title: t.title,
            email: t.email,
            lastScrapedAt: new Date(),
            isVerified: false,
            metadata: { source: 'CN_UNIVERSITY', confidence: 0.5, scrapedAt: new Date().toISOString(), universityKey: target.key },
          },
        });
        await initializeScoreBreakdowns(tx, created.id);
      });
      inserted++;
    }

    console.log(`  Saved: +${inserted} new`);
    return inserted;

  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function main() {
  let totalInserted = 0;

  for (const target of FIX_TARGETS) {
    try {
      const inserted = await diagnoseAndFix(target);
      totalInserted += inserted;
      console.log(`  >>> ${target.name}: +${inserted} total=${totalInserted}`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ❌ ${target.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`FIX TOTAL: ${totalInserted}`);
  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`DB Total: ${dbTotal}`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

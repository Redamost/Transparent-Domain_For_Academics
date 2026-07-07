// Batch Playwright scraper for all remaining 985 universities with 0 data
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

interface UniTarget {
  key: string;
  name: string;
  urls: string[];
  encoding?: 'gbk' | 'utf-8';
  clickNext?: boolean;
}

const TARGETS: UniTarget[] = [
  // ═══ STATIC_OK (15) ═══
  {
    key: 'beihang', name: '北京航空航天大学',
    urls: ['https://scse.buaa.edu.cn/szdw/jcrc1.htm', 'https://scse.buaa.edu.cn/szdw/js.htm'],
  },
  {
    key: 'seu', name: '东南大学',
    urls: ['https://cse.seu.edu.cn/101006608/list.htm'],
    clickNext: true,
  },
  {
    key: 'ruc', name: '中国人民大学',
    urls: ['http://info.ruc.edu.cn/jsky/szdw/ajxjgcx/jsjkxyjsx1/js2/'],
  },
  {
    key: 'nankai', name: '南开大学',
    urls: ['https://cs.nankai.edu.cn/szdw/js.htm'],
    clickNext: true,
  },
  {
    key: 'bit', name: '北京理工大学',
    urls: ['https://cs.bit.edu.cn/szdw/jsml/index.htm'],
    clickNext: true,
  },
  {
    key: 'dlut', name: '大连理工大学',
    urls: ['https://faculty.dlut.edu.cn/xyjslb.jsp?urltype=tsites.CollegeTeacherList&wbtreeid=1003&st=0&id=1180&py=&lang=zh_CN&state=0'],
  },
  {
    key: 'sdu', name: '山东大学',
    urls: ['https://www.cs.sdu.edu.cn/szdw1/jcrc.htm'],
  },
  {
    key: 'xmu', name: '厦门大学',
    urls: ['https://cs.xmu.edu.cn/szll/jcrc.htm', 'https://informatics.xmu.edu.cn/list_teacher.jsp?urltype=tp.TpCollegeZWTeachers&wbtreeid=2171&collegeid=1532'],
  },
  {
    key: 'nwpu', name: '西北工业大学',
    urls: ['https://jsj.nwpu.edu.cn/snew/szdw/szmd.htm'],
  },
  {
    key: 'csu', name: '中南大学',
    urls: ['https://cse.csu.edu.cn/szdw/yjsds.htm'],
  },
  {
    key: 'neu', name: '东北大学',
    urls: ['http://www.cse.neu.edu.cn/6317/list.htm', 'http://www.cse.neu.edu.cn/6318/list.htm'],
    clickNext: true,
  },
  {
    key: 'cau', name: '中国农业大学',
    urls: ['https://ciee.cau.edu.cn/col/col50400/', 'https://ciee.cau.edu.cn/col/col50401/'],
  },
  {
    key: 'nwafu', name: '西北农林科技大学',
    urls: ['https://cie.nwsuaf.edu.cn/szdw/js/'],
  },
  {
    key: 'muc', name: '中央民族大学',
    urls: ['https://xingong.muc.edu.cn/szdw/xyjs.htm'],
  },
  {
    key: 'ouc', name: '中国海洋大学',
    urls: ['https://it.ouc.edu.cn/szdw/list.htm'],
    clickNext: true,
  },
  // ═══ JS_SHELL (3) ═══
  {
    key: 'tianjin', name: '天津大学',
    urls: ['http://cic.tju.edu.cn/szdw.htm'],
  },
  {
    key: 'scut', name: '华南理工大学',
    urls: ['https://www2.scut.edu.cn/cs/szdw/js.htm'],
  },
  {
    key: 'ecnu', name: '华东师范大学',
    urls: ['https://cs.ecnu.edu.cn/szdw/list.htm'],
    clickNext: true,
  },
  // ═══ DEAD (8) — with updated URLs from search ═══
  {
    key: 'hust', name: '华中科技大学',
    urls: ['http://cs.hust.edu.cn/szdw/szll.htm', 'http://english.cs.hust.edu.cn/Faculty1/Institute_of_Artificial_Intelligence_and_Optimizat/Associate_Professors/X.htm'],
  },
  {
    key: 'tongji', name: '同济大学',
    urls: ['https://cs.tongji.edu.cn/szdw.htm', 'https://cs.tongji.edu.cn/szdw/js.htm'],
  },
  {
    key: 'sichuan', name: '四川大学',
    urls: ['https://cs.scu.edu.cn/szdw.htm', 'https://cs.scu.edu.cn/jzlm/szdw.htm'],
  },
  {
    key: 'lzu', name: '兰州大学',
    urls: ['https://xxxy.lzu.edu.cn/shiziduiwu.htm', 'https://xxxy.lzu.edu.cn/shiziduiwu/shiyanduiwu/shiyanshigongchengshi/index.html'],
  },
  {
    key: 'cqu', name: '重庆大学',
    urls: ['https://faculty.cqu.edu.cn/xyjslb.jsp?totalpage=10&PAGENUM=1&id=1135&lang=zh_CN&st=0&urltype=tsites.CollegeTeacherList&wbtreeid=1002'],
  },
  {
    key: 'bnu', name: '北京师范大学',
    urls: ['https://ai.bnu.edu.cn/szdw.htm', 'https://ai.bnu.edu.cn/szdw/jsyjy.htm'],
  },
  {
    key: 'uestc', name: '电子科技大学',
    urls: ['https://www.scse.uestc.edu.cn/szdw/js.htm', 'https://faculty.uestc.edu.cn/xylb.jsp?urltype=tsites.CollegeTeacherList&wbtreeid=1035&id=2031'],
  },
  {
    key: 'nudt', name: '国防科技大学',
    urls: ['https://www.nudt.edu.cn/xyjs/jsjxy/szdw.htm'],
  },
];

const NAME_BLACKLIST = new Set([
  '党政领导', '组织机构', '师资队伍', '杰出人才', '师资名单',
  '按职称检索', '团队现拥有', '在职教师', '兼职教授', '客座教授',
  '访问学者', '博士生导师', '硕士生导师', '教职工名录', '教师名录',
  'English', 'ENGLISH', '旧版', '教授', '副教授', '讲师', '助理教授',
  '研究员', '副研究员', '高级工程师', '助理研究员', '博士后',
  '首页', '更多', '下一页', '上一页', '尾页', '跳转',
  '学院概况', '学科建设', '科学研究', '人才培养', '招生就业',
  '新闻中心', '通知公告', '学术动态', '学生工作', '党建工作',
  '联系我们', '联系方式', '版权信息', '地址', '邮编', '电话', '传真',
  '返回顶部', '设为首页', '加入收藏', '网站地图',
  '系所导航', '快速链接', '友情链接', '校内链接',
]);

function cleanName(nameZh: string): string | null {
  if (!nameZh || nameZh.length < 2 || nameZh.length > 5) return null;
  if (!/^[一-鿿]+$/.test(nameZh)) return null;
  if (NAME_BLACKLIST.has(nameZh)) return null;

  // Strip prefixes
  const prefixes = ['副主任', '主任', '副院长', '院长', '系主任', '副系主任', '党委书记', '党委副书记', '所长', '副所长'];
  for (const p of prefixes) {
    if (nameZh.startsWith(p) && nameZh.length > p.length + 1) {
      nameZh = nameZh.slice(p.length);
      break;
    }
  }
  // Strip suffixes
  nameZh = nameZh.replace(/(?:教授|副教授|讲师|研究员|副研究员|高级工程师|工程师|助理教授|博士后|博导|硕导)$/, '');

  if (nameZh.length < 2 || nameZh.length > 4) return null;
  if (!/^[一-鿿]{2,4}$/.test(nameZh)) return null;
  return nameZh;
}

// Navigation text patterns to skip
function isNavText(text: string): boolean {
  return /^(?:首页|更多|下一页|上一页|English|办公网|个人中心|当前位置|师资|每页|总共|第一|尾页|页码|跳转|地址|联系|版权|学校|首页|概况|简介|领导|管理|组织|学院|中心|研究|教学|招生|新闻|通知|下载|综合|全部|按|查找|使用|当前|第\d|共\d)/.test(text);
}

async function scrapeTarget(target: UniTarget): Promise<number> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${target.name} (${target.key})`);
  console.log(`URLs: ${target.urls.join(', ')}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const allTeachers: Array<{
    nameZh: string;
    department?: string;
    title?: string;
    email?: string;
    website?: string;
  }> = [];
  const seen = new Set<string>();

  for (const url of target.urls) {
    console.log(`  Fetching: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    } catch {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {
        console.log(`  ❌ Failed to load`);
        continue;
      }
    }
    await page.waitForTimeout(3000);

    const text = await page.evaluate(() => document.body.innerText);
    console.log(`  Text: ${text.length} chars, CJK: ${(text.match(/[一-鿿]/g) || []).length}`);

    if (text.length < 100) {
      console.log(`  ❌ Near-empty page`);
      continue;
    }

    // Strategy 1: Extract teacher names near title keywords
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let foundThisPage = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isNavText(line)) continue;
      if (line.length > 50) continue; // skip long paragraphs

      // Pattern: Name + Title
      const nameMatch = line.match(/^([一-鿿]{2,4})\s*(教授|副教授|讲师|研究员|副研究员|工程师|高级工程师|助理教授|助理研究员|高工|博导|硕导)/);
      if (nameMatch) {
        const name = cleanName(nameMatch[1]);
        if (name && !seen.has(name)) {
          seen.add(name);
          allTeachers.push({ nameZh: name, title: nameMatch[2] });
          foundThisPage++;
        }
        continue;
      }

      // Pattern: Name alone on a line (2-4 CJK chars)
      if (/^[一-鿿]{2,4}$/.test(line)) {
        const name = cleanName(line);
        if (name && !seen.has(name)) {
          seen.add(name);
          allTeachers.push({ nameZh: name });
          foundThisPage++;
        }
        continue;
      }

      // Pattern: Name with space between chars
      const compactLine = line.replace(/\s+/g, '');
      if (/^[一-鿿]{2,4}$/.test(compactLine) && line !== compactLine) {
        const name = cleanName(compactLine);
        if (name && !seen.has(name)) {
          seen.add(name);
          allTeachers.push({ nameZh: name });
          foundThisPage++;
        }
        continue;
      }
    }

    // Strategy 2: Emails with nearby names
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    let emailMatch;
    while ((emailMatch = emailRegex.exec(text)) !== null) {
      const email = emailMatch[1].toLowerCase();
      const pos = emailMatch.index;
      // Look for name in 100 chars before the email
      const context = text.slice(Math.max(0, pos - 100), pos);
      const nameInContext = context.match(/([一-鿿]{2,4})/g);
      if (nameInContext) {
        // Take the last name before the email
        const lastName = nameInContext[nameInContext.length - 1];
        const name = cleanName(lastName);
        if (name) {
          const existing = allTeachers.find(t => t.nameZh === name);
          if (existing) {
            existing.email = email;
          } else if (!seen.has(name)) {
            seen.add(name);
            allTeachers.push({ nameZh: name, email });
            foundThisPage++;
          }
        }
      }
    }

    console.log(`  Found ${foundThisPage} teachers this page (total ${allTeachers.length})`);

    // Click "下一页" for pagination if enabled
    if (target.clickNext) {
      for (let p = 2; p <= 8; p++) {
        try {
          const nextLink = page.locator('a:has-text("下一页")').first();
          if (await nextLink.isVisible({ timeout: 2000 })) {
            await nextLink.click();
            await page.waitForTimeout(2000);

            const moreText = await page.evaluate(() => document.body.innerText);
            const moreLines = moreText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            let moreFound = 0;

            for (const line of moreLines) {
              if (isNavText(line)) continue;
              if (line.length > 50) continue;

              const nm = line.match(/^([一-鿿]{2,4})\s*(教授|副教授|讲师|研究员|副研究员|工程师|高级工程师|助理教授|助理研究员|高工|博导|硕导)/);
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
            console.log(`  Page ${p}: +${moreFound} teachers`);
            if (moreFound === 0) break;
          } else {
            break;
          }
        } catch { break; }
      }
    }
  }

  console.log(`  Total unique: ${allTeachers.length}`);

  // ─── PERSIST ───
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
          department: t.department,
          title: t.title,
          email: t.email,
          website: t.website,
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
  await ctx.close();
  await browser.close();
  return inserted;
}

async function main() {
  let totalInserted = 0;
  const results: Array<{ name: string; key: string; inserted: number }> = [];

  for (const target of TARGETS) {
    try {
      const inserted = await scrapeTarget(target);
      totalInserted += inserted;
      results.push({ name: target.name, key: target.key, inserted });
      console.log(`  >>> ${target.name}: +${inserted} total=${totalInserted}`);

      // Delay between universities
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ❌ ${target.name} failed:`, err instanceof Error ? err.message : String(err));
      results.push({ name: target.name, key: target.key, inserted: 0 });
    }
  }

  // ─── FINAL REPORT ───
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`FINAL REPORT`);
  console.log(`Total new scholars: ${totalInserted}`);

  for (const r of results) {
    console.log(`  ${r.name}: +${r.inserted}`);
  }

  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nDB Total: ${dbTotal}`);

  // By institution
  const byInst = await prisma.person.groupBy({
    by: ['institution'],
    where: { isActive: true },
    _count: true,
    orderBy: { _count: { nameZh: 'desc' } },
  });
  console.log('\nBy institution (top 20):');
  for (const r of byInst.slice(0, 20)) {
    console.log(`  ${r.institution}: ${r._count}`);
  }

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

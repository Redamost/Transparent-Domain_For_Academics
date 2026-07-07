// Playwright-based scraper for JS-rendered university pages
// Uses system-installed Microsoft Edge (Chromium-based)
import { chromium } from 'playwright';
import * as fs from 'fs';

interface ScrapedTeacher {
  nameZh: string;
  title?: string;
  department?: string;
  email?: string;
  bio?: string;
  website: string;
  institution: string;
}

const OUTPUT_FILE = 'playwright-scraped.json';

async function scrapeFudan(): Promise<ScrapedTeacher[]> {
  console.log('\n=== Fudan CS Teacher List ===');
  const results: ScrapedTeacher[] = [];

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'zh-CN',
    });
    const page = await context.newPage();

    // Navigate to Fudan CS teacher list
    console.log('Navigating to https://cs.fudan.edu.cn/szdw/list.htm...');
    await page.goto('https://cs.fudan.edu.cn/szdw/list.htm', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for teacher list to render (JS may take time)
    await page.waitForTimeout(3000);

    // Get the rendered HTML
    const html = await page.content();
    console.log(`Rendered page size: ${html.length} bytes`);

    // Extract all links with Chinese text
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      const result: Array<{ href: string; text: string }> = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();
        if (href && text && /[一-鿿]/.test(text)) {
          result.push({ href, text });
        }
      }
      return result;
    });

    console.log(`Found ${links.length} links with Chinese text`);

    // Filter to potential teacher names
    const teacherLinks = links.filter(l => {
      const t = l.text;
      // Skip obvious navigation
      if (/^(?:首页|更多|查看|下一页|上一页|English|ENGLISH)$/.test(t)) return false;
      // Skip nav text
      if (/学院|概况|师资|人才|新闻|通知|联系|招生|下载|研究|教育|学术|教学|中心|平台|机构|领导|管理|专业|学科|学生/.test(t)) return false;
      // Must look like a name (2-4 CJK chars)
      if (!/^[一-鿿]{2,4}$/.test(t)) return false;
      return true;
    });

    console.log(`Teacher name links: ${teacherLinks.length}`);
    for (const l of teacherLinks.slice(0, 20)) {
      console.log(`  ${l.text} → ${l.href}`);
    }

    // Now visit each teacher profile page
    const baseUrl = 'https://cs.fudan.edu.cn';
    for (const tl of teacherLinks.slice(0, 10)) { // Limit to 10 for testing
      let profileUrl = tl.href;
      if (profileUrl.startsWith('/')) profileUrl = baseUrl + profileUrl;
      else if (!profileUrl.startsWith('http')) {
        profileUrl = 'https://cs.fudan.edu.cn/szdw/' + profileUrl;
      }

      console.log(`\n  Visiting profile: ${profileUrl}`);
      try {
        await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);

        const profileHtml = await page.content();

        // Extract name
        const nameMatch = profileHtml.match(/<title>([^<]+)<\/title>/i);
        const nameZh = nameMatch ? nameMatch[1].trim().replace(/[-|—–].*$/, '').trim() : tl.text;

        // Extract title
        const titleMatch = profileHtml.match(/(?:教授|副教授|讲师|研究员|副研究员|工程师)/);
        const title = titleMatch ? titleMatch[0] : undefined;

        // Extract email
        const emailMatch = profileHtml.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        const email = emailMatch ? emailMatch[1].toLowerCase() : undefined;

        // Clean text for bio
        const text = profileHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Try to find bio
        const bioMatch = text.match(/(?:个人简介|教师简介|研究方向|研究领域)[：:]\s*([\s\S]{20,500}?)(?:教育背景|工作经历|联系方式|招生|研究方向|发表论文)/);
        const bio = bioMatch ? bioMatch[1].trim().slice(0, 1000) : text.slice(0, 500);

        const deptMatch = text.match(/(?:学院|系别|院系|所属单位|所在单位)[：:]\s*([^\s,，]{2,20})/);
        const department = deptMatch ? deptMatch[1] : undefined;

        console.log(`    Name: ${nameZh} | Title: ${title || '?'} | Email: ${email || 'N'} | Dept: ${department || '?'}`);

        results.push({
          nameZh,
          title,
          department,
          email,
          bio: bio.slice(0, 1000),
          website: profileUrl,
          institution: '复旦大学',
        });
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message.slice(0, 50) : String(err)}`);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

async function main() {
  const target = process.argv[2] || 'fudan';

  let results: ScrapedTeacher[] = [];

  if (target === 'fudan') {
    results = await scrapeFudan();
  }

  console.log(`\n=== Total scraped: ${results.length} teachers ===`);

  // Save to file
  const existing: ScrapedTeacher[] = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try { existing.push(...JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'))); } catch {}
  }
  const all = [...existing, ...results];
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(all, null, 2), 'utf-8');
  console.log(`Saved to ${OUTPUT_FILE} (total: ${all.length})`);
}

main().catch(console.error);

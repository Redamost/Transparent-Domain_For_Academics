// Playwright scraper for XJTU (JS-rendered list pages)
import { chromium } from 'playwright';
import * as fs from 'fs';

async function scrapeXJTU() {
  console.log('\n=== XJTU CS Teacher List ===');
  const results: any[] = [];

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'zh-CN',
    });
    const page = await context.newPage();

    // Try the teacher directory URL
    const url = 'http://www.cs.xjtu.edu.cn/szdw/jsml.htm';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const html = await page.content();
    console.log(`Rendered: ${html.length} bytes, CJK: ${(html.match(/[一-鿿]/g)||[]).length}`);

    // Extract all links
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

    console.log(`Links found: ${links.length}`);

    // Filter to teacher names (2-3 CJK characters)
    const teacherLinks = links.filter(l => {
      const t = l.text;
      if (t.length < 2 || t.length > 10) return false;
      if (/^(?:首页|更多|下一页|上一页|English)$/.test(t)) return false;
      if (/学院|中心|研究|机构|工程|技术|教学|管理|行政|党委|工会/.test(t)) return false;
      // Must start with CJK
      if (!/^[一-鿿]/.test(t)) return false;
      return true;
    });

    console.log(`\nPotential teacher links: ${teacherLinks.length}`);
    for (const l of teacherLinks.slice(0, 25)) {
      console.log(`  "${l.text}" → ${l.href}`);
    }

    // Visit first 3 teacher profiles
    const baseUrl = 'http://www.cs.xjtu.edu.cn';
    for (const tl of teacherLinks.slice(0, 5)) {
      let profileUrl = tl.href;
      if (profileUrl.startsWith('/')) profileUrl = baseUrl + profileUrl;
      else if (!profileUrl.startsWith('http')) profileUrl = `${baseUrl}/szdw/${profileUrl}`;

      console.log(`\n  Profile: ${profileUrl}`);
      try {
        await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);

        const profHtml = await page.content();
        console.log(`    Size: ${profHtml.length}B`);

        const titleMatch = profHtml.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        console.log(`    Title: ${title.slice(0, 100)}`);

        // Extract name from title or content
        const nameMatch = title.match(/^([一-鿿]{2,4})/) || profHtml.match(/([一-鿿]{2,4})\s*(?:教授|副教授|讲师)/);
        const nameZh = nameMatch ? nameMatch[1] : tl.text;
        console.log(`    Name: ${nameZh}`);

        // Email
        const emailMatch = profHtml.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) console.log(`    Email: ${emailMatch[1]}`);

        results.push({
          nameZh,
          website: profileUrl,
          institution: '西安交通大学',
          email: emailMatch ? emailMatch[1].toLowerCase() : undefined,
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
  const results = await scrapeXJTU();
  console.log(`\n=== Scraped ${results.length} XJTU teachers ===`);

  // Save
  const file = 'playwright-xjtu.json';
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
  fs.writeFileSync(file, JSON.stringify([...existing, ...results], null, 2), 'utf-8');
  console.log(`Saved to ${file}`);
}

main().catch(console.error);

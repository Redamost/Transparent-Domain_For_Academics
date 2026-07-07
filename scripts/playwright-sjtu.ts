// Playwright diagnostic for SJTU teacher pages
import { chromium } from 'playwright';

async function inspect(label: string, url: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${label}: ${url}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ locale: 'zh-CN' });
    const page = await ctx.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    const cjk = (html.match(/[一-鿿]/g)||[]).length;

    console.log(`HTML: ${html.length}B, CJK: ${cjk}`);
    console.log(`Visible text (first 800 chars):`);
    console.log(text.slice(0, 800));

    // Find links matching teacher profile patterns
    const allLinks = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      return Array.from(anchors).map(a => ({
        href: a.getAttribute('href') || '',
        text: (a.textContent || '').trim(),
      }));
    });

    // Filter to non-nav, name-like links
    const nameLinks = allLinks.filter(l => {
      const t = l.text;
      if (!t || t.length < 2 || t.length > 8) return false;
      if (!/^[一-鿿A-Z]/.test(t)) return false;
      if (/^(?:首页|更多|下一页|上一页|English|学院|中心|研究|教学|招生|新闻|通知|联系|下载)/.test(t)) return false;
      if (l.href.includes('jaccount')) return false;
      return true;
    });

    console.log(`\nName-like links: ${nameLinks.length}`);
    for (const l of nameLinks.slice(0, 25)) {
      console.log(`  "${l.text}" → ${l.href.slice(0, 120)}`);
    }

    // Also look for teacher names in the page text
    const teacherNames = text.match(/[一-鿿]{2,4}\s*(?:教授|副教授|讲师|研究员)/g);
    if (teacherNames) {
      const unique = [...new Set(teacherNames)].slice(0, 15);
      console.log(`\nTeacher names in page text: ${unique.join(', ')}`);
    }

    await ctx.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  await inspect('SJTU 教师名录', 'https://www.cs.sjtu.edu.cn/jiaoshiml.html');
  await inspect('SJTU 院士学者', 'https://www.cs.sjtu.edu.cn/lyys.html');
  await inspect('SJTU 国家级人才', 'https://www.cs.sjtu.edu.cn/gjjrc.html');
}

main().catch(console.error);

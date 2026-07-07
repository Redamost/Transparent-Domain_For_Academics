// Playwright diagnostic for remaining C9: USTC, HIT, XJTU
import { chromium } from 'playwright';

async function inspect(label: string, url: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${label}: ${url}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'zh-CN',
    });
    const page = await ctx.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    } catch {
      console.log('  Navigation timeout — trying domcontentloaded...');
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {
        console.log('  FAILED to load');
        return;
      }
    }
    await page.waitForTimeout(3000);

    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    const cjk = (html.match(/[一-鿿]/g)||[]).length;

    console.log(`HTML: ${html.length}B, CJK: ${cjk}, Text: ${text.length} chars`);

    if (cjk < 50) {
      console.log('  ⚠️ Very few CJK — likely JS shell or 404');
      console.log(`  Text preview: ${text.slice(0, 300)}`);
      return;
    }

    // Show text preview
    console.log(`Text preview (500 chars):`);
    console.log(text.slice(0, 500));

    // Count potential teacher names
    const nameMatches = text.match(/[一-鿿]{2,4}(?=\s*(?:教授|副教授|讲师|研究员|博导|硕导|\n|$))/g);
    if (nameMatches) {
      const unique = [...new Set(nameMatches)].filter(n => !/学院|中心|研究|工程|技术|大学|实验室/.test(n));
      console.log(`\nPotential teacher names: ${unique.length}`);
      console.log(`  Sample: ${unique.slice(0, 20).join(', ')}`);
    }

    // Find profile links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .filter(a => /[一-鿿]/.test(a.textContent || ''))
        .map(a => ({
          href: a.getAttribute('href') || '',
          text: (a.textContent || '').trim(),
        }));
    });

    // Filter to non-nav name links
    const nameLinks = links.filter(l => {
      const t = l.text;
      if (t.length < 2 || t.length > 6) return false;
      if (!/^[一-鿿]/.test(t)) return false;
      if (/^(?:首页|更多|下一页|上一页|English|学院|中心|研究|教学|招生|新闻|通知|联系|下载|概况|简介|领导|管理|组织)/.test(t)) return false;
      return true;
    });

    console.log(`\nName-like links: ${nameLinks.length}`);
    for (const l of nameLinks.slice(0, 15)) {
      console.log(`  "${l.text}" → ${l.href.slice(0, 120)}`);
    }

    await ctx.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  // USTC CS — JS rendered
  await inspect('USTC CS', 'https://cs.ustc.edu.cn/szdw/list.htm');

  // USTC CS alternative URLs
  await inspect('USTC CS main', 'https://cs.ustc.edu.cn/main.htm');

  // HIT — try with Playwright (maybe browser works where fetch fails)
  await inspect('HIT Computing', 'https://computing.hit.edu.cn/11261/list.htm');

  // XJTU — try different URLs
  await inspect('XJTU CS', 'http://www.cs.xjtu.edu.cn/szdw/jsml.htm');
  await inspect('XJTU CS jqt', 'http://www.cs.xjtu.edu.cn/szdw/jsml/jsjqt.htm');
}

main().catch(console.error);

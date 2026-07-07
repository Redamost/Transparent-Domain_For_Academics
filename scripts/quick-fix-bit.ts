// Quick fix for 北京理工大学 (BIT) — URL was STATIC_OK but got 0 in batch
import { chromium } from 'playwright';
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  const page = await ctx.newPage();

  // Direct URL that passed the connectivity test
  const url = 'https://cs.bit.edu.cn/szdw/jsml/index.htm';
  console.log(`Loading: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
  } catch {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {
      console.log('Failed to load');
      return;
    }
  }
  await page.waitForTimeout(4000);

  const text = await page.evaluate(() => document.body.innerText);
  console.log(`Text: ${text.length} chars`);
  console.log(`Preview (first 500):`);
  console.log(text.slice(0, 500));

  // Find profile links
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => /[一-鿿]{2,4}/.test(a.textContent || ''))
      .map(a => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim() }))
      .filter(l => l.text.length >= 2 && l.text.length <= 6);
  });

  console.log(`\nName links: ${links.length}`);
  for (const l of links.slice(0, 20)) {
    console.log(`  "${l.text}" → ${l.href.slice(0, 100)}`);
  }

  await ctx.close();
  await browser.close();
}
main();

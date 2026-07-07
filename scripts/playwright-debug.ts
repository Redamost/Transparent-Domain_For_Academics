// Playwright debug: check what's happening with JS-rendered pages
import { chromium } from 'playwright';

async function debugPage(label: string, url: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${label}: ${url}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'zh-CN',
    });
    const page = await context.newPage();

    // Collect failed requests
    const failedUrls: string[] = [];
    page.on('requestfailed', request => {
      failedUrls.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
    });

    // Collect JS console errors
    const consoleErrors: string[] = [];
    page.on('pageerror', error => {
      consoleErrors.push(error.message.slice(0, 100));
    });

    console.log('Navigating...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded, waiting 5s more for JS...');
    await page.waitForTimeout(5000);

    // Take a snapshot of the page
    const html = await page.content();
    const title = await page.title();
    const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 1000));

    console.log(`Title: ${title}`);
    console.log(`HTML size: ${html.length}B, Visible text: ${visibleText.length} chars`);
    console.log(`Failed requests: ${failedUrls.length}`);
    if (failedUrls.length > 0) {
      for (const f of failedUrls.slice(0, 5)) console.log(`  FAIL: ${f}`);
    }
    console.log(`Console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      for (const e of consoleErrors.slice(0, 5)) console.log(`  ERR: ${e}`);
    }

    // Show first 500 chars of visible text
    console.log(`\nVisible text preview:`);
    console.log(visibleText.slice(0, 500));

    // Get all links
    const linkCount = await page.evaluate(() => document.querySelectorAll('a').length);
    console.log(`\nTotal <a> elements: ${linkCount}`);

    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  // Try XJTU
  await debugPage('XJTU CS jsml', 'http://www.cs.xjtu.edu.cn/szdw/jsml.htm');

  // Try Fudan with a different approach - maybe the teacher data is at a different URL
  await debugPage('Fudan CS szdw', 'https://cs.fudan.edu.cn/szdw/list.htm');

  // Try USTC CS
  await debugPage('USTC CS szdw', 'https://cs.ustc.edu.cn/szdw/list.htm');
}

main().catch(console.error);

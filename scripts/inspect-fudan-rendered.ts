// Deep inspect Fudan teacher list rendered DOM structure
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();

  const url = 'https://cs.fudan.edu.cn/szdw/list.htm';
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get the visible text
  const visibleText = await page.evaluate(() => document.body.innerText);
  console.log('Visible text (first 1500 chars):');
  console.log(visibleText.slice(0, 1500));

  // Find teacher names like "张鹏", "张奇" in the DOM
  const teacherElements = await page.evaluate(() => {
    const results: Array<{ tag: string; text: string; href: string; className: string; parentTag: string }> = [];
    // Look for elements containing teacher names
    const namePattern = /^(张鹏|张奇|叶广楠|薛莘|陈荣华|朱东来|王李霞|熊贇|冯红伟|冯颖欣|陈辰|张玥杰|朱元婷|朱莉)$/;

    // Check all elements
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (namePattern.test(text) && text.length <= 5) {
        // Check if it's in an <a> tag or has a parent <a>
        let anchor = el as Element | null;
        while (anchor && anchor.tagName !== 'A' && anchor.tagName !== 'BODY') {
          anchor = anchor.parentElement;
        }
        const href = (anchor && anchor.tagName === 'A') ? (anchor as HTMLAnchorElement).getAttribute('href') || '' : '';

        results.push({
          tag: el.tagName,
          text: text.slice(0, 20),
          href: href.slice(0, 100),
          className: (el as HTMLElement).className?.slice(0, 50) || '',
          parentTag: el.parentElement?.tagName || '',
        });

        // Show surrounding HTML
        if (results.length <= 3) {
          console.log(`\nElement: <${el.tagName}> "${text}"`);
          console.log(`  Class: ${(el as HTMLElement).className}`);
          console.log(`  Parent: ${el.parentElement?.tagName}.${(el.parentElement as HTMLElement)?.className}`);
          console.log(`  Anchor href: ${href || 'NONE'}`);
          console.log(`  OuterHTML (400 chars): ${el.outerHTML.slice(0, 400)}`);
        }
      }
    }
    return results;
  });

  console.log(`\n\nFound ${teacherElements.length} teacher name elements`);
  const withLinks = teacherElements.filter(t => t.href);
  const withoutLinks = teacherElements.filter(t => !t.href);
  console.log(`  With <a> links: ${withLinks.length}`);
  console.log(`  Without links: ${withoutLinks.length}`);

  if (withoutLinks.length > 0) {
    console.log(`\n  === Teachers WITHOUT links (first 5) ===`);
    for (const t of withoutLinks.slice(0, 5)) {
      console.log(`  <${t.tag}> "${t.text}" class="${t.className}" parent:<${t.parentTag}>`);
    }
  }

  if (withLinks.length > 0) {
    console.log(`\n  === Teachers WITH links ===`);
    for (const t of withLinks) {
      console.log(`  "${t.text}" → ${t.href}`);
    }
  }

  await context.close();
  await browser.close();
}

main().catch(console.error);

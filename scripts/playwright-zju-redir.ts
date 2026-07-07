// ZJU: Try to follow PHP redirect links to find actual profile URLs
import { chromium } from 'playwright';

async function main() {
  console.log('=== ZJU Teacher Directory Redirect Investigation ===\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  const page = await ctx.newPage();

  // Visit the teacher directory
  const url = 'http://www.cs.zju.edu.cn/csen/27003/list.htm';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText);
  console.log(`Page: ${html.length}B, Visible text: ${text.length} chars`);

  // Find all redir.php links
  const redirLinks = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href*="redir.php"]');
    return Array.from(anchors).map(a => ({
      href: a.getAttribute('href') || '',
      text: (a.textContent || '').trim(),
    }));
  });

  console.log(`\nRedir.php links: ${redirLinks.length}`);
  for (const l of redirLinks.slice(0, 10)) {
    console.log(`  "${l.text}" → ${l.href}`);
  }

  // Try clicking on redir links and capturing the redirect
  console.log('\n=== Testing redirect by clicking links ===');

  for (let i = 0; i < Math.min(redirLinks.length, 5); i++) {
    const linkText = redirLinks[i].text;

    // Set up navigation listener to capture redirect
    const navPromise = new Promise<string>(resolve => {
      page.once('framenavigated', frame => {
        if (frame === page.mainFrame()) resolve(frame.url());
      });
      setTimeout(() => resolve('TIMEOUT'), 5000);
    });

    try {
      // Click the link
      const link = page.locator(`a[href*="redir.php"]:has-text("${linkText}")`).first();
      if (await link.isVisible({ timeout: 2000 })) {
        console.log(`\n  Clicking "${linkText}"...`);
        await link.click();

        const newUrl = await navPromise;
        console.log(`  Redirected to: ${newUrl}`);

        if (newUrl !== 'TIMEOUT' && newUrl !== url) {
          // Check the profile page
          await page.waitForTimeout(2000);
          const profText = await page.evaluate(() => document.body.innerText);
          const profTitle = await page.title();
          console.log(`  Profile title: ${profTitle}`);
          console.log(`  Profile text (300 chars): ${profText.slice(0, 300)}`);
        }

        // Go back to list page
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(3000);
      }
    } catch (err) {
      console.log(`  Error: ${err instanceof Error ? err.message.slice(0, 50) : String(err)}`);
    }
  }

  // Also check: are there any direct profile links on the page?
  console.log('\n=== Checking for non-redirect profile links ===');
  const allHrefs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href') || '');
  });
  const profilePatterns = allHrefs.filter(h =>
    !h.includes('redir.php') &&
    !h.includes('list.htm') &&
    (h.includes('page.htm') || h.includes('info/') || h.includes('teacher') || h.includes('faculty') || /\d+\.htm/.test(h))
  );
  console.log(`Non-redirect profile links: ${profilePatterns.length}`);
  for (const h of profilePatterns.slice(0, 15)) {
    console.log(`  ${h}`);
  }

  await ctx.close();
  await browser.close();
}

main().catch(console.error);

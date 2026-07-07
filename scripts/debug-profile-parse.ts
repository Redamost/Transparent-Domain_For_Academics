// ─── Debug Profile Parsing ───
// Fetches a sample profile page from a university and prints its HTML structure
// to diagnose why parseProfileHtml is failing.
//
// Usage: npx tsx scripts/debug-profile-parse.ts <university-key>

import 'dotenv/config';
import { getUniversityConfig, scrapeUniversity } from '../src/lib/scraping/cn-university';

async function main() {
  const uniKey = process.argv[2] || 'fudan';
  const uni = getUniversityConfig(uniKey);
  if (!uni) {
    console.error(`Unknown university: ${uniKey}`);
    process.exit(1);
  }

  console.log(`[Debug] Fetching faculty list for ${uni.nameZh}...`);

  // Use the first faculty list
  const listUrl = uni.facultyLists[0].url;
  console.log(`[Debug] List URL: ${listUrl}`);

  // Fetch the list page
  const response = await fetch(listUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });

  if (!response.ok) {
    console.error(`[Debug] HTTP ${response.status} for list page`);
    process.exit(1);
  }

  const html = await response.text();

  // Find profile links
  const linkPattern = /<a[^>]*href="([^"]+)"[^>]*>([一-鿿]{2,6})<\/a>/gi;
  const links: Array<{ url: string; name: string }> = [];
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    let href = match[1];
    if (!href.startsWith('http')) {
      const base = new URL(listUrl);
      href = new URL(href, base.origin + base.pathname).href;
    }
    if (href.includes('.edu.cn')) {
      links.push({ url: href, name: match[2] });
    }
  }

  console.log(`[Debug] Found ${links.length} profile links`);

  // Fetch the first 3 profile pages
  for (let i = 0; i < Math.min(3, links.length); i++) {
    const { url, name } = links[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Debug] Profile #${i + 1}: ${name} — ${url}`);

    try {
      const profResp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!profResp.ok) {
        console.log(`[Debug] HTTP ${profResp.status}`);
        continue;
      }

      const profHtml = await profResp.text();

      // Show the <title> tag
      const titleMatch = profHtml.match(/<title>([^<]+)<\/title>/i);
      console.log(`[Debug] <title>: ${titleMatch ? titleMatch[1].trim() : 'NOT FOUND'}`);

      // Strip HTML and look for key sections
      const text = profHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Show first 500 chars of text
      console.log(`[Debug] Text start (500 chars):`);
      console.log(text.slice(0, 500));

      // Search for name patterns
      const nameInText = text.includes(name);
      console.log(`[Debug] Name "${name}" found in text: ${nameInText}`);

      // Search for key labels
      for (const label of ['姓名', '职称', '职务', '所属', '院系', '学院', '研究方向', '个人简介', '教师简介', '电话', '邮箱', 'Email', 'E-mail']) {
        const idx = text.indexOf(label);
        if (idx >= 0) {
          console.log(`[Debug] Found "${label}" at position ${idx}: ...${text.slice(Math.max(0, idx - 10), idx + 80)}...`);
        } else {
          console.log(`[Debug] "${label}": NOT FOUND`);
        }
      }

      // Show meta tags
      const metaMatch = profHtml.match(/<meta[^>]+>/gi);
      if (metaMatch) {
        console.log(`[Debug] Meta tags: ${metaMatch.slice(0, 5).join(' | ')}`);
      }

    } catch (err) {
      console.log(`[Debug] Error: ${err instanceof Error ? err.message : err}`);
    }

    // Small delay
    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(console.error);

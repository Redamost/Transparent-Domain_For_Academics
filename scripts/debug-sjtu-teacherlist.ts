// Debug SJTU teacherlist.html links
import 'dotenv/config';

async function fetchUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'zh-CN'},
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

function findLinks(html: string, baseUrl: string): Array<{href: string; text: string}> {
  const results: Array<{href: string; text: string}> = [];
  const seen = new Set<string>();
  const allLinks = html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of allLinks) {
    let href = (m[1]||'').trim();
    const text = (m[2]||'').replace(/<[^>]+>/g, '').trim();
    if (!href || !text) continue;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    if (href.startsWith('/')) href = `https://www.cs.sjtu.edu.cn${href}`;
    else if (!href.startsWith('http')) { const base = baseUrl.substring(0, baseUrl.lastIndexOf('/')+1); href = base + href; }
    if (seen.has(href)) continue;
    seen.add(href);
    if (/[一-鿿]/.test(text)) results.push({href, text});
  }
  return results;
}

async function main() {
  const url = 'https://www.cs.sjtu.edu.cn/teacherlist.html';

  console.log('=== Fetching SJTU teacherlist.html ===');
  const html = await fetchUrl(url);
  if (!html) { console.log('FAILED'); return; }

  console.log(`Size: ${html.length}B`);

  const links = findLinks(html, url);
  console.log(`Found ${links.length} links with Chinese text`);

  // Filter to non-nav
  const nonNav = links.filter(l => {
    const t = l.text;
    if (/^(?:首页|更多|查看|下一页|上一页|返回|English|ENGLISH)$/.test(t)) return false;
    if (t.length > 15) return false;
    return true;
  });
  console.log(`Non-nav links: ${nonNav.length}`);
  for (const l of nonNav.slice(0, 20)) {
    console.log(`  "${l.text}" → ${l.href.slice(0, 120)}`);
  }

  // Fetch a profile page from the teacherlist
  if (nonNav.length > 0) {
    const profileUrl = nonNav[0].href;
    console.log(`\n=== Fetching profile: ${profileUrl} ===`);
    const profHtml = await fetchUrl(profileUrl);
    if (profHtml) {
      console.log(`Size: ${profHtml.length}B`);
      const title = profHtml.match(/<title>([^<]+)<\/title>/i);
      if (title) console.log(`Title: ${title[1].trim().slice(0, 100)}`);

      // Check key patterns
      const namePatterns = [
        /姓名[：:]\s*([^\s<]{2,6})/,
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员)/,
      ];
      for (const p of namePatterns) {
        const m = profHtml.match(p);
        if (m) console.log(`  NameMatch [${p.source.slice(0,40)}]: "${m[1]?.trim()}"`);
      }

      const text = profHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`Text preview: ${text.slice(0, 300)}`);
    }
  }
}

main().catch(console.error);

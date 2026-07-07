// Debug: check SJTU profile page HTML to understand why 0 of 118 profiles parsed
import 'dotenv/config';

async function fetchUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch { return null; }
}

async function main() {
  // First, get the list page and extract profile URLs
  console.log('=== Fetching SJTU list pages ===\n');

  const listUrls = [
    'https://www.cs.sjtu.edu.cn/jiaoshiml.html',
    'https://www.cs.sjtu.edu.cn/lyys.html',
  ];

  for (const listUrl of listUrls) {
    const html = await fetchUrl(listUrl);
    if (!html) { console.log(`Failed: ${listUrl}`); continue; }

    // Extract profile links (same patterns as scraper)
    const linkPattern = /<a[^>]*href="([^"]*(?:\/info\/\d+\/\d+\.html?|\/teacher\/|\/faculty\/|\/\d{4}\/\d{4}\/[^"]*\d+\.html?|\.jsp)[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi;
    const links: string[] = [];
    const matches = html.matchAll(linkPattern);
    for (const m of matches) {
      let href = m[1]?.trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      if (href.startsWith('/')) href = `https://www.cs.sjtu.edu.cn${href}`;
      else if (!href.startsWith('http')) {
        const base = listUrl.substring(0, listUrl.lastIndexOf('/') + 1);
        href = `${base}${href}`;
      }
      if (href.includes('.edu.cn')) links.push(href);
    }

    console.log(`List: ${listUrl}`);
    console.log(`Found ${links.length} profile links (sample: ${links.slice(0, 5).join(', ')})`);

    // Fetch first 2 profile pages
    for (const link of links.slice(0, 2)) {
      console.log(`\n--- Profile: ${link} ---`);
      const profileHtml = await fetchUrl(link);
      if (!profileHtml) { console.log('  FAILED to fetch'); continue; }

      console.log(`  Size: ${profileHtml.length} bytes`);

      // Check title
      const titleMatch = profileHtml.match(/<title>([^<]+)<\/title>/i);
      console.log(`  Title: ${titleMatch ? titleMatch[1].trim() : 'NONE'}`);

      // Check for name patterns
      const namePatterns = [
        /姓名[：:]\s*([^\s<]{2,6})/,
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员)/,
        /<h[123][^>]*>([^<]{2,30})<\/h[123]>/i,
      ];
      for (const p of namePatterns) {
        const m = profileHtml.match(p);
        if (m) console.log(`  NameMatch [${p.source.slice(0, 50)}]: "${m[1]?.trim()}"`);
      }

      // Check for common field patterns
      const fieldPatterns = [
        /职称[：:]\s*([^\s<]+)/,
        /院系[：:]\s*([^\s<]+)/,
        /研究方向[：:]\s*([^\s<]{5,50})/,
        /邮箱[：:]\s*([^\s<]+)/,
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      ];
      for (const p of fieldPatterns) {
        const m = profileHtml.match(p);
        if (m) console.log(`  Field [${p.source.slice(0, 50)}]: "${m[1]?.trim() || m[0]}"`);
      }

      // Show first 500 chars of stripped text
      const text = profileHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`  Text preview (first 200 chars): ${text.slice(0, 200)}`);
    }
  }
}

main().catch(console.error);

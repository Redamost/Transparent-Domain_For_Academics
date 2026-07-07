// Deep debug for fixable C9 universities: USTC, PKU, ZJU
import 'dotenv/config';

async function fetchUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch { return null; }
}

function findLinks(html: string, baseUrl: string): Array<{ href: string; text: string; fullMatch: string }> {
  // Very broad pattern to find ALL possible profile links
  const patterns = [
    /<a[^>]*href="([^"]*(?:\/info\/|\.htm|\.html|\.jsp|\.php|\.aspx)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]*href="([^"]*\/\d+\/[^"]*\.html?[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  const results: Array<{ href: string; text: string; fullMatch: string }> = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const m of matches) {
      let href = m[1]?.trim();
      let text = m[2]?.replace(/<[^>]+>/g, '').trim();
      if (!href || !text) continue;
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

      // Resolve URL
      if (href.startsWith('/')) {
        try { const u = new URL(baseUrl); href = `${u.protocol}//${u.host}${href}`; } catch {}
      } else if (!href.startsWith('http')) {
        const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        href = `${base}${href}`;
      }

      if (!href.includes('.edu.cn') && !href.includes('.ac.cn')) continue;
      if (seen.has(href)) continue;
      seen.add(href);

      // Filter nav text
      if (/^(?:首页|学院概况|师资队伍|科学研究|人才培养|学生工作|新闻|通知|联系|招生|下载|更多|English|ENGLISH)$/.test(text)) continue;
      if (text.length > 20 || text.length < 2) continue;
      if (!/[一-鿿]/.test(text)) continue;

      results.push({ href, text, fullMatch: m[0].slice(0, 120) });
    }
  }
  return results;
}

async function inspectPage(label: string, url: string) {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`📄 ${label}`);
  console.log(`   URL: ${url}`);

  const html = await fetchUrl(url);
  if (!html) { console.log('   ❌ Failed to fetch'); return; }

  const clean = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const cjkCount = (clean.match(/[一-鿿]/g) || []).length;
  console.log(`   Size: ${html.length}B, CJK: ${cjkCount}`);

  // Show title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) console.log(`   Title: ${titleMatch[1].trim().slice(0, 100)}`);

  // Find links
  const links = findLinks(html, url);
  console.log(`   Links found: ${links.length}`);

  // Categorize links
  const nameLinks = links.filter(l => /[一-鿿]{2,3}$/.test(l.text) || /^[一-鿿]{2,4}$/.test(l.text));
  console.log(`   Name-like links: ${nameLinks.length}`);

  for (const l of links.slice(0, 15)) {
    const icon = nameLinks.includes(l) ? '👤' : '  ';
    console.log(`   ${icon} text:"${l.text.slice(0, 30)}" href:"${l.href.slice(0, 80)}"`);
  }

  // If we found name-like links, inspect the first profile page
  if (links.length > 0) {
    const profileUrl = links[0].href;
    console.log(`\n   🔍 Inspecting profile: ${profileUrl}`);
    const profHtml = await fetchUrl(profileUrl);
    if (profHtml) {
      console.log(`   Profile size: ${profHtml.length}B`);
      const profTitle = profHtml.match(/<title>([^<]+)<\/title>/i);
      if (profTitle) console.log(`   Profile title: ${profTitle[1].trim().slice(0, 120)}`);

      // Try name extraction patterns
      const nameTests = [
        /姓名[：:]\s*([^\s<]{2,6})/,
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员)/,
        /<h[123][^>]*>\s*([一-鿿]{2,6})\s*<\/h[123]>/i,
      ];
      for (const p of nameTests) {
        const m = profHtml.match(p);
        if (m) console.log(`   NameMatch: "${m[1]?.trim()}" via ${p.source.slice(0, 40)}`);
      }

      // Show stripped text
      const text = profHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`   Text preview: ${text.slice(0, 200)}`);
    }
  }
}

async function main() {
  // ═══ USTC MATH (328KB, 6106 CJK!) ═══
  await inspectPage('USTC Math list', 'https://math.ustc.edu.cn/szdw/list.htm');

  // ═══ PKU qtcy ═══
  await inspectPage('PKU CS qtcy', 'https://cs.pku.edu.cn/cse/qtcy.htm');

  // ═══ ZJU CS ═══
  await inspectPage('ZJU CS list', 'http://www.cs.zju.edu.cn/csen/26695/list.htm');

  // ═══ USTC Physics ═══
  await inspectPage('USTC Physics list', 'https://physics.ustc.edu.cn/szdw/list.htm');

  // ═══ NJU Physics ═══
  await inspectPage('NJU Physics list', 'https://physics.nju.edu.cn/szdw.htm');
}

main().catch(console.error);

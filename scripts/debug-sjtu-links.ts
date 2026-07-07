// Debug: inspect SJTU list page to see what links are discovered
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

// Copy of discoverProfileLinks for debugging
function discoverProfileLinks(html: string, listUrl: string): string[] {
  const patterns = [
    /<a[^>]*href="([^"]*(?:\/teacher\/|\/people\/|\/faculty\/|\/person\/|\/facultyDetail\/)[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    /<a[^>]*href="([^"]*(?:\/info\/)\d+\/\d+\.html?[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    /<a[^>]*href="([^"]*(?:\/\d+\/|(?:\/|_)[a-z]+\d*\.html?|(?:\/|_)\d+\.html?)[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    /<a[^>]*href="([^"]*\/\d{4}\/\d{4}\/[^"]*\d+\.html?[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    /<a[^>]*href="([^"]*\.jsp[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    /<a[^>]*href="([^"]*\/szdw\/(?:js|info|zrjs|jsml|szll)\/[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    /<a[^>]*href="([^"]*(?:\/[jt]id[=\/]\d+|\/teacher\/\d+|\/faculty\/\d+)[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    /<a[^>]*href="([^"]*(?:\/jsmc\/|\/jsml\/|\/szll\/|\/jzgml\/|\/zrjs\/)[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
  ];

  const links = new Set<string>();
  const baseUrl = (() => {
    try { const u = new URL(listUrl); return `${u.protocol}//${u.host}`; }
    catch { return ''; }
  })();

  const NAV_SKIP = new Set(['首页', '上一页', '下一页', '尾页', '末页', '学院概况', '师资队伍', '人才培养', '科学研究', '学生工作', '新闻中心', '通知公告', '招生信息', '就业信息', '下载中心', '联系方式', '网站地图', 'English', 'ENGLISH']);

  function isNavText(text: string): boolean {
    const cleaned = text.replace(/<[^>]+>/g, '').trim();
    for (const nav of NAV_SKIP) { if (cleaned.includes(nav)) return true; }
    if (cleaned.length > 20) return true;
    if (/^(?:更多|查看|下一页|上一页|返回|首页)/.test(cleaned)) return true;
    return false;
  }

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const m of matches) {
      const fullMatch = m[0];
      let href = m[1]?.trim();
      if (!href) continue;
      if (isNavText(fullMatch)) continue;
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
      if (href.startsWith('/')) href = `${baseUrl}${href}`;
      else if (!href.startsWith('http')) {
        const base = listUrl.substring(0, listUrl.lastIndexOf('/') + 1);
        href = `${base}${href}`;
      }
      if (href.includes('.edu.cn')) links.add(href);
    }
  }
  return [...links];
}

async function main() {
  const listUrls = [
    'https://www.cs.sjtu.edu.cn/jiaoshiml.html',
    'https://www.cs.sjtu.edu.cn/lyys.html',
    'https://www.seiee.sjtu.edu.cn/szdw.htm',
  ];

  for (const listUrl of listUrls) {
    console.log(`\n=== ${listUrl} ===`);
    const html = await fetchUrl(listUrl);
    if (!html) { console.log('  FAILED to fetch'); continue; }
    console.log(`  Size: ${html.length}B`);

    const links = discoverProfileLinks(html, listUrl);
    console.log(`  Links found: ${links.length}`);
    for (const link of links.slice(0, 10)) {
      console.log(`    ${link}`);
    }

    // Check first 2 profile pages
    for (const link of links.slice(0, 2)) {
      console.log(`\n  --- Profile: ${link} ---`);
      const profileHtml = await fetchUrl(link);
      if (!profileHtml) { console.log('    FAILED to fetch (maybe timeout/404)'); continue; }
      console.log(`    Size: ${profileHtml.length}B`);

      const titleMatch = profileHtml.match(/<title>([^<]+)<\/title>/i);
      console.log(`    Title: ${titleMatch ? titleMatch[1].trim().slice(0, 80) : 'NONE'}`);

      // Show relevant parts
      const nameMatch = profileHtml.match(/姓名[：:]\s*([^\s<]{2,6})/);
      if (nameMatch) console.log(`    姓名: ${nameMatch[1]}`);

      const titleMatch2 = profileHtml.match(/职称[：:]\s*([^\s<]+)/);
      if (titleMatch2) console.log(`    职称: ${titleMatch2[1]}`);

      const deptMatch = profileHtml.match(/(?:院系|学院|系别|所属单位)[：:]\s*([^\s<]+)/);
      if (deptMatch) console.log(`    院系: ${deptMatch[1]}`);

      const emailMatch = profileHtml.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) console.log(`    Email: ${emailMatch[1]}`);

      // Check if page is JS-rendered
      const cjkCount = (profileHtml.match(/[一-鿿]/g) || []).length;
      const scriptCount = (profileHtml.match(/<script[^>]*>/gi) || []).length;
      console.log(`    CJK:${cjkCount} Scripts:${scriptCount}`);
      if (cjkCount < 20 && scriptCount > 3) console.log(`    ⚠️ LIKELY JS-RENDERED`);
    }

    await new Promise(r => setTimeout(r, 1500));
  }
}

main().catch(console.error);

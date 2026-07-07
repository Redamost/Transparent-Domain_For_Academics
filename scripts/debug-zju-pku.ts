// Debug ZJU 177KB teacher directory + PKU 招生导师名单
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

async function analyzePage(label: string, url: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📄 ${label}`);
  console.log(`   ${url}`);

  const html = await fetchUrl(url);
  if (!html) { console.log('   ❌ Failed'); return; }

  console.log(`   Size: ${html.length}B, CJK: ${(html.match(/[一-鿿]/g)||[]).length}`);

  // Show title
  const title = html.match(/<title>([^<]+)<\/title>/i);
  if (title) console.log(`   Title: ${title[1].trim().slice(0, 100)}`);

  // Find ALL links in the page
  const allLinks = html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
  const links: Array<{href: string; text: string}> = [];
  for (const m of allLinks) {
    const href = (m[1]||'').trim();
    const text = (m[2]||'').replace(/<[^>]+>/g, '').trim();
    if (href && text && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
      links.push({ href, text });
    }
  }

  console.log(`   Total links: ${links.length}`);

  // Categorize
  const withChinese = links.filter(l => /[一-鿿]/.test(l.text));
  console.log(`   Links with Chinese: ${withChinese.length}`);

  // Find links that look like teacher names (2-4 CJK characters)
  const nameLinks = withChinese.filter(l => {
    const t = l.text;
    return /^[一-鿿]{2,4}$/.test(t) || /^[一-鿿]{2,4}[（(]/.test(t);
  });
  console.log(`   Name-like (2-4 CJK): ${nameLinks.length}`);
  for (const l of nameLinks.slice(0, 20)) {
    console.log(`     "${l.text}" → ${l.href.slice(0, 100)}`);
  }

  // Find links with 中文 text that are NOT nav
  const notNav = withChinese.filter(l => {
    const t = l.text;
    return !/首页|学院|概况|师资|人才|新闻|通知|联系|招生|下载|研究|教育|学术|教学|中心|平台|机构|领导|管理|更多|English|ENGLISH/.test(t);
  });
  console.log(`   Non-nav links: ${notNav.length}`);
  for (const l of notNav.slice(0, 20)) {
    console.log(`     "${l.text.slice(0, 40)}" → ${l.href.slice(0, 100)}`);
  }

  // Look at the raw HTML around teacher names
  // Find text that looks like "姓名，教授" patterns
  const namePatterns = html.matchAll(/([一-鿿]{2,4})\s*(?:教授|副教授|讲师|研究员|博导|硕导)/g);
  const names = new Set<string>();
  for (const m of namePatterns) {
    const n = m[1].trim();
    if (!/学院|中心|研究|机构|工程|技术|科学|计算|智能/.test(n)) {
      names.add(n);
    }
  }
  console.log(`   Teacher names in text: ${names.size}`);
  if (names.size > 0) console.log(`     ${[...names].slice(0, 15).join(', ')}`);
}

async function main() {
  // ZJU teacher directory (177KB)
  await analyzePage('ZJU Teacher Directory', 'http://www.cs.zju.edu.cn/csen/27003/list.htm');

  // PKU 招生导师名单 (78KB)
  await analyzePage('PKU Supervisor List', 'https://cs.pku.edu.cn/info/1265/3293.htm');
}

main().catch(console.error);

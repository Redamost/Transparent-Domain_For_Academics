// Check the ACTUAL teacher list pages on Fudan CS site
import 'dotenv/config';

async function checkPage(url: string, label: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Checking: ${label} — ${url}`);

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  if (!resp.ok) { console.log(`HTTP ${resp.status}`); return; }
  const html = await resp.text();
  console.log(`HTML length: ${html.length}`);

  // Find links with names (2-6 CJK chars, standalone in <a> tag)
  const pattern = /<a[^>]*href="([^"]*)"[^>]*>\s*([一-鿿]{2,6})\s*<\/a>/gi;
  const names: Array<{ href: string; name: string }> = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    names.push({ href: m[1], name: m[2] });
  }
  console.log(`Links with 2-6 CJK name: ${names.length}`);
  if (names.length > 0) {
    console.log('First 15:');
    for (const n of names.slice(0, 15)) {
      console.log(`  ${n.name} -> ${n.href}`);
    }
  }

  // Also find ALL <a> tags and check for ones that look like profile pages
  const allHrefs = [...html.matchAll(/<a[^>]*href="([^"]*\/info\/\d+\/[^"]*)"[^>]*>([^<]*)<\/a>/gi)];
  console.log(`/info/ pattern links: ${allHrefs.length}`);
  for (const h of allHrefs.slice(0, 10)) {
    console.log(`  "${h[2].trim().slice(0, 30)}" -> ${h[1]}`);
  }

  // Check for /page/ pattern
  const pageLinks = [...html.matchAll(/<a[^>]*href="([^"]*\/page\/[^"]*)"[^>]*>([^<]*)<\/a>/gi)];
  console.log(`/page/ pattern links: ${pageLinks.length}`);
  for (const h of pageLinks.slice(0, 5)) {
    console.log(`  "${h[2].trim().slice(0, 30)}" -> ${h[1]}`);
  }

  // Check for "查看详情" or "详细"
  const detailLinks = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(?:查看详情|详细|more|More)<\/a>/gi)];
  console.log(`Detail links: ${detailLinks.length}`);

  // Show some raw HTML around first 2000-3000 chars to understand structure
  const stripped = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  console.log('\nHTML excerpt (chars 1000-2000):');
  console.log(stripped.slice(1000, 2000));
}

async function main() {
  // The real teacher list pages from the navigation
  await checkPage('https://cs.fudan.edu.cn/53161/list.htm', '教职工名录（按职称）');
  await checkPage('https://cs.fudan.edu.cn/53162/list.htm', '教职工名录（按拼音）');
}

main().catch(console.error);

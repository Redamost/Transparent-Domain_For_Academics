// Debug: Find actual teacher profile links on Fudan list page
import 'dotenv/config';

async function main() {
  const resp = await fetch('https://cs.fudan.edu.cn/szdw/list.htm', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  const html = await resp.text();

  // Find ALL links with text containing teacher-related keywords
  const pattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const allLinks: Array<{ href: string; text: string }> = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text.length >= 2) {
      allLinks.push({ href: m[1], text });
    }
  }
  console.log('All links:', allLinks.length);

  // Show links with teacher/professor related text
  const teacherKW = ['教师', '教授', '教职工', '师资', '博导', '硕导', '导师', '研究员', '讲师', '副教授'];
  for (const link of allLinks) {
    if (teacherKW.some(kw => link.text.includes(kw))) {
      console.log(`  [TEACHER] "${link.text}" -> ${link.href}`);
    }
  }

  // Find links specifically matching teacher names — these would be links
  // pointing to /info/XXXX/XXX.htm or with query parameters
  const nameLinkPattern = /<a[^>]*href="([^"]*\/info\/\d+\/\d+\.html?[^"]*)"[^>]*>/gi;
  const infoLinks = [...html.matchAll(nameLinkPattern)];
  console.log(`\nInfo pattern links: ${infoLinks.length}`);

  // Find links on this page that go to sub-pages of szdw
  const szdwLinks = allLinks.filter(l => l.href.includes('szdw'));
  console.log(`\nszdw links: ${szdwLinks.length}`);
  szdwLinks.forEach(l => console.log(`  "${l.text}" -> ${l.href}`));

  // SPECIAL: check if this page has an embedded iframe or JS-loaded content
  const iframes = html.match(/<iframe[^>]*src="([^"]*)"[^>]*>/gi);
  console.log('\nIframes:', iframes?.length || 0);
  if (iframes) iframes.forEach(f => console.log('  ', f));

  // Check for JS data
  const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const s of scripts) {
    if (s.includes('teacher') || s.includes('faculty') || s.includes('szdw') || s.includes('list')) {
      console.log('\nScript with teacher data (first 300 chars):', s.slice(0, 300));
    }
  }

  // The actual teacher list might be loaded via AJAX. Let's check the page text
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Find text around "师资队伍" or "教职工名录"
  const idx1 = textContent.indexOf('教职工名录');
  if (idx1 >= 0) {
    console.log('\n--- Context around "教职工名录" ---');
    console.log(textContent.slice(Math.max(0, idx1 - 50), idx1 + 200));
  }
}

main().catch(console.error);

// Debug: Inspect Fudan CS faculty list page HTML structure
import 'dotenv/config';

async function main() {
  const resp = await fetch('https://cs.fudan.edu.cn/szdw/list.htm', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  const html = await resp.text();
  console.log('HTML length:', html.length);

  // Find all <a> tags with Chinese text
  const allATags = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
  console.log(`\nTotal <a> tags: ${allATags.length}`);

  // Filter for ones with Chinese names (2-6 CJK chars)
  const chineseNameLinks = allATags.filter(m => /^[一-鿿]{2,6}$/.test(m[2].trim()));
  console.log(`Chinese name links: ${chineseNameLinks.length}`);
  console.log('First 20:');
  for (const m of chineseNameLinks.slice(0, 20)) {
    console.log(`  href="${m[1]}" > ${m[2].trim()}`);
  }

  // Look for teacher-specific href patterns
  console.log('\n--- Looking for teacher href patterns ---');
  const teacherPatterns = html.match(/href="([^"]*(?:teacher|faculty|people|person|\/info\/|\/page\/)[^"]*)"/gi);
  console.log('Teacher-like hrefs:', teacherPatterns?.slice(0, 20));

  // Look for the actual faculty list content area
  console.log('\n--- Looking for faculty list structure ---');
  // Common patterns: <ul class="teacher-list">, <div class="faculty">, etc.
  const listBlocks = html.match(/<(?:ul|div|table)[^>]*(?:teacher|faculty|szdw|jsmd|jsjj)[^>]*>[\s\S]*?<\/(?:ul|div|table)>/gi);
  console.log('List blocks found:', listBlocks?.length || 0);
  if (listBlocks) {
    for (const block of listBlocks.slice(0, 3)) {
      console.log('--- Block ---');
      console.log(block.slice(0, 500));
    }
  }
}

main().catch(console.error);

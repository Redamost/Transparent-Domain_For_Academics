// Debug: inspect nwpu faculty list page to find teacher profile links
import 'dotenv/config';

async function main() {
  const LIST_URL = 'https://jsj.nwpu.edu.cn/snew/szdw/szmd.htm';

  const resp = await fetch(LIST_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  const buffer = await resp.arrayBuffer();
  const html = new TextDecoder('utf-8').decode(buffer);

  console.log(`Page size: ${html.length}B, CJK chars: ${(html.match(/[一-鿿]/g) || []).length}`);

  // Strip scripts and styles
  const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Find ALL <a> tags with Chinese text
  console.log('\n=== All <a> tags with Chinese text (no nav filter) ===');
  const allLinks = cleanHtml.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
  let count = 0;
  for (const m of allLinks) {
    const href = m[1]?.trim();
    const text = m[2]?.replace(/<[^>]+>/g, '').trim();
    if (text && /[一-鿿]/.test(text) && !href?.startsWith('#') && !href?.startsWith('javascript:')) {
      count++;
      if (count <= 40) {
        console.log(`  [${count}] href="${href?.slice(0, 80)}" text="${text.slice(0, 60)}"`);
      }
    }
  }
  console.log(`Total links with Chinese text: ${count}`);

  // Look for teacher names — patterns like "张三  教授  ..."
  console.log('\n=== Content around "教授" keywords ===');
  const profMatches = cleanHtml.matchAll(/(.{0,60}(?:教授|副教授|讲师).{0,60})/g);
  let profCount = 0;
  for (const m of profMatches) {
    const text = m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Filter out nav text
    if (!/学院|首页|师资|联系|招生|简介|概况|新闻|研究|领导|管理/.test(text)) {
      profCount++;
      if (profCount <= 30) {
        console.log(`  ${text.slice(0, 150)}`);
      }
    }
  }

  // Check for specific URL patterns that might be teacher profiles
  console.log('\n=== URLs matching profile patterns ===');
  const profilePatterns = [
    /href="([^"]*\/info\/\d+\/\d+\.html?[^"]*)"/gi,
    /href="([^"]*\/szdw\/[^"]*[一-鿿][^"]*)"/gi,
    /href="([^"]*\/(?:teacher|faculty)\/[^"]*)"/gi,
    /href="([^"]*\/\d{4}\/\d{4}\/[^"]*\.html?[^"]*)"/gi,
  ];
  for (const pat of profilePatterns) {
    const matches = html.matchAll(pat);
    for (const m of matches) {
      console.log(`  ${m[1]}`);
    }
  }

  // Show the raw HTML around teacher names
  console.log('\n=== Looking for name-like text near URLs ===');
  // Look for patterns where a URL is followed/preceded by 2-4 CJK characters
  const nameNearLink = cleanHtml.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]*[一-鿿]{2,4}[^<]*)<\/a>/gi);
  let nameCount = 0;
  for (const m of nameNearLink) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (/[一-鿿]{2,4}/.test(text) && !/学院|首页|师资|招生|联系|新闻|研究|概况|简介|更多|通知|下载/.test(text)
        && text.length >= 2 && text.length <= 12 && !href?.endsWith('.htm') && !href?.endsWith('.html')) {
      nameCount++;
      if (nameCount <= 20) {
        console.log(`  "${text}" -> ${href?.slice(0, 100)}`);
      }
    }
  }
}

main().catch(console.error);

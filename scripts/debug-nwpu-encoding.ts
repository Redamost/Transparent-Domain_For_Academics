// Debug: check nwpu page encoding by fetching raw bytes
import 'dotenv/config';

async function main() {
  const LIST_URL = 'https://jsj.nwpu.edu.cn/snew/szdw/szmd.htm';

  console.log('=== Fetching nwpu faculty list ===');
  const resp = await fetch(LIST_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  console.log(`Status: ${resp.status}`);
  console.log(`Content-Type: ${resp.headers.get('content-type')}`);

  const buffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  console.log(`Size: ${bytes.length} bytes`);

  // Show first 100 bytes as hex
  console.log(`\nFirst 100 bytes (hex):`);
  const hexStr = Array.from(bytes.slice(0, 100)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(hexStr);

  // Try different encodings
  const encodings = ['utf-8', 'gb2312', 'gbk', 'gb18030'];
  for (const enc of encodings) {
    try {
      const decoder = new TextDecoder(enc);
      const text = decoder.decode(buffer);
      const cjkCount = (text.match(/[一-鿿]/g) || []).length;
      const gbkMarkerCount = (text.match(/[鏄鐨涓鏂鍏鑳鎵鐢闄鑷鍒浠榛]/g) || []).length;

      // Show first 300 chars
      const preview = text.slice(0, 300).replace(/\s+/g, ' ');
      console.log(`\n--- ${enc} (CJK:${cjkCount}, GBK-markers:${gbkMarkerCount}) ---`);
      console.log(preview);

      // Check for common Chinese text
      const hasChinese = /[一-鿿]{3,}/.test(text);
      const hasNav = /师资|教授|学院|教师|博士|研究生/.test(text);
      console.log(`  HasCJK:${hasChinese} HasNav:${hasNav}`);
    } catch (e) {
      console.log(`\n--- ${enc}: ERROR ${e} ---`);
    }
  }

  // Now also try getting a profile page
  console.log('\n\n=== First, find a profile link ===');
  // Try GBK decode for link discovery
  const gbkText = new TextDecoder('gbk').decode(buffer);

  // Look for profile links with Chinese names
  const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?([一-鿿]{2,6})[\s\S]*?<\/a>/gi;
  const links: Array<{ href: string; text: string }> = [];
  const matches = gbkText.matchAll(linkPattern);
  for (const m of matches) {
    const href = m[1]?.trim();
    const text = m[2]?.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    // Look for names (not nav text)
    if (/首页|学院|师资|人才|新闻|通知|联系|招生|下载|研究|本科生|研究生/.test(text)) continue;
    if (text.length >= 2 && text.length <= 4) {
      let fullHref = href;
      if (fullHref.startsWith('/')) fullHref = `https://jsj.nwpu.edu.cn${fullHref}`;
      else if (!fullHref.startsWith('http')) {
        const base = LIST_URL.substring(0, LIST_URL.lastIndexOf('/') + 1);
        fullHref = `${base}${fullHref}`;
      }
      links.push({ href: fullHref, text });
    }
  }

  console.log(`Found ${links.length} potential teacher links`);
  for (const l of links.slice(0, 10)) {
    console.log(`  ${l.text} -> ${l.href}`);
  }

  // Fetch and inspect first profile page
  if (links.length > 0) {
    console.log(`\n\n=== Fetching profile: ${links[0].href} ===`);
    const profResp = await fetch(links[0].href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    console.log(`Status: ${profResp.status}`);
    console.log(`Content-Type: ${profResp.headers.get('content-type')}`);

    const profBuffer = await profResp.arrayBuffer();
    console.log(`Size: ${profBuffer.byteLength} bytes`);

    for (const enc of ['gbk', 'utf-8', 'gb2312']) {
      try {
        const decoder = new TextDecoder(enc);
        const text = decoder.decode(profBuffer);
        const cjkCount = (text.match(/[一-鿿]/g) || []).length;
        const gbkMarkers = (text.match(/[鏄鐨涓鏂鍏鑳鎵鐢闄鑷鍒浠榛]/g) || []).length;

        // Check for name patterns
        const nameMatch1 = text.match(/姓名[：:]\s*([^\s<]{2,6})/);
        const nameMatch2 = text.match(/<title>([^<]+)<\/title>/i);
        const h1Match = text.match(/<h1[^>]*>([^<]+)<\/h1>/i);

        console.log(`\n--- ${enc} (CJK:${cjkCount}, markers:${gbkMarkers}) ---`);
        if (nameMatch1) console.log(`  姓名: ${nameMatch1[1]}`);
        if (nameMatch2) console.log(`  Title: ${nameMatch2[1].trim().slice(0, 100)}`);
        if (h1Match) console.log(`  H1: ${h1Match[1].trim().slice(0, 100)}`);

        const preview = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        console.log(`  Text: ${preview}`);
      } catch (e) {
        console.log(`  ${enc}: ERROR ${e}`);
      }
    }
  }
}

main().catch(console.error);

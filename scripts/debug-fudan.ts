// ─── Debug: Check why Fudan profile parsing fails ───
import 'dotenv/config';

async function main() {
  const listUrl = 'https://cs.fudan.edu.cn/szdw/list.htm';
  console.log('[Debug] Fetching:', listUrl);

  const resp = await fetch(listUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  console.log('[Debug] Status:', resp.status);
  const html = await resp.text();
  console.log('[Debug] HTML length:', html.length);

  // Find first 3 profile links
  const re = /<a[^>]*href="([^"]+)"[^>]*>([一-鿿]{2,6})<\/a>/gi;
  let m;
  const links: Array<{ url: string; name: string }> = [];
  while ((m = re.exec(html)) !== null && links.length < 3) {
    const href = m[1];
    if (href.includes('.edu.cn') || href.startsWith('/')) {
      const fullUrl = href.startsWith('http') ? href : `https://cs.fudan.edu.cn${href.startsWith('/') ? '' : '/'}${href}`;
      links.push({ url: fullUrl, name: m[2] });
    }
  }
  console.log('[Debug] First 3 links:', JSON.stringify(links, null, 2));

  // Fetch and inspect each profile page
  for (let i = 0; i < links.length; i++) {
    const { url, name } = links[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Debug] Profile #${i + 1}: ${name}`);
    console.log(`[Debug] URL: ${url}`);

    const pResp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    console.log('[Debug] Profile status:', pResp.status);

    const pHtml = await pResp.text();
    console.log('[Debug] Profile HTML length:', pHtml.length);

    // <title>
    const ti = pHtml.match(/<title>([^<]+)<\/title>/i);
    console.log('[Debug] <title>:', ti ? ti[1].trim() : 'N/A');

    // Strip HTML and show text
    const text = pHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log('[Debug] Text length:', text.length);
    console.log('[Debug] Text (first 600 chars):');
    console.log(text.slice(0, 600));
    console.log('---');

    // Check for key Chinese labels
    const labels = ['姓名', '职称', '职务', '所属', '院系', '学院', '系别', '研究方向', '研究领域', '个人简介', '教师简介', '个人简历', '电话', '邮箱', 'Email', 'E-mail', '教育背景', '工作经历', '发表论文', '获奖'];
    for (const label of labels) {
      const idx = text.indexOf(label);
      if (idx >= 0) {
        const ctx = text.slice(Math.max(0, idx - 10), idx + 60);
        console.log(`  [FOUND] "${label}" at ${idx}: ...${ctx}...`);
      }
    }

    // Check nameZh patterns
    const nameZhPatterns = [
      /姓名[：:]\s*([^\s<]{2,6})/,
      /<title>([^\s\-|]{2,6})\s*(?:个人主页|个人简介|教师简介|师资队伍|教授|副教授|讲师)/,
      /<title>([^<]{2,30})<\/title>/,
    ];
    for (const pat of nameZhPatterns) {
      const m2 = text.match(pat);
      console.log(`  [PARSER TEST] ${pat.source.slice(0, 50)}: ${m2 ? m2[1]?.trim() : 'NO MATCH'}`);
    }

    await new Promise(r => setTimeout(r, 1500));
  }
}

main().catch(console.error);

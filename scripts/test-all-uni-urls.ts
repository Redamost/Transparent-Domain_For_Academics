// Test ALL 985 university list page URLs to see which are reachable
import 'dotenv/config';
import { UNIVERSITY_CONFIGS } from '../src/lib/scraping/cn-university';

async function testUrl(url: string): Promise<{ ok: boolean; status: number; size: number; isJs: boolean }> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    const html = await resp.text();
    const cjkCount = (html.match(/[一-鿿]/g) || []).length;
    // Detect JS-rendered: very few CJK chars + lots of script tags = likely JS rendered
    const scriptCount = (html.match(/<script[^>]*>/gi) || []).length;
    const isJs = cjkCount < 20 && scriptCount > 3;
    return { ok: resp.ok, status: resp.status, size: html.length, isJs };
  } catch (err) {
    return { ok: false, status: 0, size: 0, isJs: false };
  }
}

async function main() {
  console.log('Testing all 985 university list page URLs...\n');

  const results: Array<{ key: string; name: string; url: string; status: number; size: number; isJs: boolean }> = [];

  for (const uni of UNIVERSITY_CONFIGS) {
    const listUrl = uni.facultyLists[0].url;
    const result = await testUrl(listUrl);

    let icon = '✅';
    if (result.status === 0) icon = '💀';
    else if (result.status === 404) icon = '❌';
    else if (result.status >= 500) icon = '⚠️';
    else if (result.isJs) icon = '🔧';
    else if (!result.ok) icon = '⚠️';

    const sizeKB = (result.size / 1024).toFixed(0);
    const jsLabel = result.isJs ? ' [JS-RENDERED]' : '';
    console.log(`${icon} ${uni.key.padEnd(10)} ${uni.nameZh.padEnd(16)} HTTP${result.status} ${sizeKB}KB${jsLabel}  ${listUrl}`);

    results.push({
      key: uni.key,
      name: uni.nameZh,
      url: listUrl,
      status: result.status,
      size: result.size,
      isJs: result.isJs,
    });

    // Small delay between requests
    await new Promise(r => setTimeout(r, 800));
  }

  // Summary
  const ok = results.filter(r => r.status >= 200 && r.status < 400 && !r.isJs);
  const dead = results.filter(r => r.status === 404 || r.status === 0);
  const jsRendered = results.filter(r => r.isJs);
  const otherError = results.filter(r => r.status >= 400 && r.status !== 404 && r.status !== 0);

  console.log(`\n=== Summary ===`);
  console.log(`✅ Reachable (not JS): ${ok.length}`);
  console.log(`❌ Dead (404/timeout): ${dead.length}`);
  console.log(`🔧 JS-rendered:        ${jsRendered.length}`);
  console.log(`⚠️  Other errors:       ${otherError.length}`);

  console.log(`\nDead URLs:`);
  for (const r of dead) {
    console.log(`  ${r.key}: ${r.url}`);
  }

  console.log(`\nJS-rendered:`);
  for (const r of jsRendered) {
    console.log(`  ${r.key}: ${r.url}`);
  }
}

main().catch(console.error);

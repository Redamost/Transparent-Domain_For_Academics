// Diagnose C9 League universities — comprehensive scraping status
import 'dotenv/config';
import { scrapeUniversity, getUniversityConfig } from '../src/lib/scraping/cn-university';

const C9_KEYS = ['tsinghua', 'pku', 'zju', 'fudan', 'sjtu', 'ustc', 'nju', 'hit', 'xjtu'];

async function testUrl(url: string): Promise<{ ok: boolean; status: number; size: number; cjk: number; scripts: number }> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    const html = await resp.text();
    const cjk = (html.match(/[一-鿿]/g) || []).length;
    const scripts = (html.match(/<script[^>]*>/gi) || []).length;
    return { ok: resp.ok, status: resp.status, size: html.length, cjk, scripts };
  } catch {
    return { ok: false, status: 0, size: 0, cjk: 0, scripts: 0 };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  C9 League 高校爬取诊断');
  console.log('═══════════════════════════════════════════════\n');

  for (const key of C9_KEYS) {
    const uni = getUniversityConfig(key);
    if (!uni) { console.log(`❌ ${key}: NOT FOUND in config`); continue; }

    console.log(`\n━━━ ${uni.nameZh} (${key}) ━━━`);

    // Check each faculty list URL
    for (let i = 0; i < uni.facultyLists.length; i++) {
      const fl = uni.facultyLists[i];
      const result = await testUrl(fl.url);

      const sizeKB = (result.size / 1024).toFixed(0);
      const jsLabel = (result.cjk < 20 && result.scripts > 3) ? ' 🔧JS' : '';
      const statusIcon = !result.ok ? (result.status === 404 ? '💀404' : result.status === 0 ? '💀TIMEOUT' : `⚠️${result.status}`) : '✅';

      console.log(`  List[${i}]: ${statusIcon} ${sizeKB}KB CJK:${result.cjk}${jsLabel}  ${fl.url}`);
      await new Promise(r => setTimeout(r, 500));
    }

    // Try scraping with very small limit
    console.log(`  Scraping (max 5)...`);
    try {
      const start = Date.now();
      const { profiles } = await scrapeUniversity(key, 5);
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);

      if (profiles.length === 0) {
        console.log(`  ❌ 0 profiles in ${elapsed}s`);
      } else {
        console.log(`  ✅ ${profiles.length} profiles in ${elapsed}s:`);
        for (const p of profiles.slice(0, 3)) {
          console.log(`     ${p.nameZh} | ${p.title || '?'} | ${p.department || '?'} | bio:${p.bio ? 'Y' : 'N'}`);
        }
      }
    } catch (err) {
      console.log(`  💀 ERROR: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
    }

    // Delay between universities
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  诊断完成`);
  console.log(`═══════════════════════════════════════════════`);
}

main().catch(console.error);

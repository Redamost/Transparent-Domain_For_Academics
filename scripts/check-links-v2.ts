// Quick check: test improved discoverProfileLinks on key universities
// Only fetches list page and counts discovered links — no profile fetching
import 'dotenv/config';
import { getUniversityConfig } from '../src/lib/scraping/cn-university';

const TARGETS = ['hit', 'seu', 'tianjin', 'csu', 'hnu', 'ouc', 'nankai', 'sdu',
  'xjtu', 'nju', 'tongji', 'beihang', 'uestc', 'ecnu', 'bnu'];

async function main() {
  // We need to use the internal discoverProfileLinks function
  // Import it dynamically since it's not exported
  const cnUni = await import('../src/lib/scraping/cn-university');

  for (const key of TARGETS) {
    const uni = getUniversityConfig(key);
    if (!uni) { console.log(`? ${key}: NOT FOUND`); continue; }

    const listUrl = uni.facultyLists[0].url;
    try {
      const resp = await fetch(listUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        const icon = resp.status === 404 ? '💀' : '⚠️';
        console.log(`${icon} ${key.padEnd(10)} ${uni.nameZh.padEnd(12)} HTTP ${resp.status}`);
        continue;
      }

      const html = await resp.text();
      // Use the actual scrape function which will use our improved discoverProfileLinks
      const { profiles } = await cnUni.scrapeUniversity(key, 3);
      const icon = profiles.length > 0 ? '✅' : '❌';
      console.log(`${icon} ${key.padEnd(10)} ${uni.nameZh.padEnd(12)} ${html.length}B -> ${profiles.length} profiles`);
      if (profiles.length > 0) {
        for (const p of profiles.slice(0, 2)) {
          console.log(`     ${p.nameZh} | ${p.title || '?'} | ${p.department || '?'}`);
        }
      }
    } catch (err) {
      console.log(`💀 ${key.padEnd(10)} ${uni.nameZh.padEnd(12)} ${err instanceof Error ? err.message.slice(0, 40) : 'error'}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
}

main().catch(console.error);

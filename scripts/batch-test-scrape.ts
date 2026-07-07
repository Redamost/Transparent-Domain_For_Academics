// Batch test: scrape 3 profiles from each reachable university to see which work
import 'dotenv/config';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';

// Universities with reachable list pages (HTTP 200, not JS-rendered, >2KB HTML)
// Excluding WHU/SYSU/JLU/Tsinghua which already have good data
const TEST_TARGETS = [
  // Large HTML (good candidates)
  'sysu',      // 141KB - already has 102, but test anyway
  'hnu',       // 74KB
  'tsinghua',  // 76KB - already has 51
  'muc',       // 62KB - NEW
  'csu',       // 61KB - NEW
  'whu',       // 59KB - already has 402
  'pku',       // 57KB - only 4 seed
  'bit',       // 46KB - only 0
  'xmu',       // 47KB - only 0
  'hit',       // 33KB - only 2 seed
  'fudan',     // 28KB - only 3 seed
  'sjtu',      // 28KB - only 2 seed
  'sdu',       // 27KB - only 0
  'ruc',       // 26KB - only 0
  'ouc',       // 22KB - NEW
  'jlu',       // 20KB - already has 89
  // Smaller HTML (might work)
  'zju',       // 15KB - only 3 seed
  'nankai',    // 15KB - only 0
  'seu',       // 14KB - only 0
  'tianjin',   // 10KB - only 0
  'cqu',       // 0KB - but HTTP 200 (JSP page, might be JS)
  // Very small (likely problematic)
  'xjtu',      // 2KB - might be JS
  'ustc',      // 2KB - might be JS
  'scut',      // 2KB - might be JS
];

async function main() {
  const targetKey = process.argv[2];
  const targets = targetKey ? TEST_TARGETS.filter(t => t === targetKey) : TEST_TARGETS;

  console.log(`Testing ${targets.length} universities (max 5 profiles each)...\n`);

  for (const key of targets) {
    try {
      const start = Date.now();
      const { profiles } = await scrapeUniversity(key, 5);
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const icon = profiles.length > 0 ? '✅' : '❌';
      console.log(`${icon} ${key.padEnd(10)} ${profiles.length} profiles in ${elapsed}s`);
      for (const p of profiles.slice(0, 3)) {
        console.log(`     ${p.nameZh} | ${p.title || '?'} | ${p.department || '?'} | bio:${p.bio ? 'Y' : 'N'}`);
      }
    } catch (err) {
      console.log(`💀 ${key.padEnd(10)} ERROR: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`);
    }
    // Longer delay between universities
    await new Promise(r => setTimeout(r, 4000));
  }
}

main().catch(console.error);

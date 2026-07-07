// Quick test: scrape 3 profiles from each fixed C9 university
import 'dotenv/config';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';

const TARGETS = ['zju', 'hit', 'sjtu', 'pku'];

async function main() {
  for (const key of TARGETS) {
    console.log(`\n=== ${key} (max 5 profiles) ===`);
    try {
      const start = Date.now();
      const { profiles } = await scrapeUniversity(key, 5);
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);

      if (profiles.length === 0) {
        console.log(`  ❌ 0 profiles in ${elapsed}s`);
      } else {
        console.log(`  ✅ ${profiles.length} profiles in ${elapsed}s:`);
        for (const p of profiles.slice(0, 5)) {
          console.log(`     ${p.nameZh} | ${p.title || '?'} | ${p.department || '?'} | bio:${p.bio ? 'Y' : 'N'} | email:${p.email || 'N'}`);
        }
      }
    } catch (err) {
      console.log(`  💀 ERROR: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}

main().catch(console.error);

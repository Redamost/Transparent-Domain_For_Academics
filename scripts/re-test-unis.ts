// Re-test universities with improved discoverProfileLinks
import 'dotenv/config';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';

async function main() {
  const targets = ['hit', 'seu', 'tianjin', 'csu', 'hnu', 'ouc', 'nankai', 'sdu'];
  for (const key of targets) {
    console.log(`\n=== Testing ${key} (max 5 profiles) ===`);
    try {
      const { profiles } = await scrapeUniversity(key, 5);
      console.log(`  Result: ${profiles.length} profiles`);
      for (const p of profiles.slice(0, 3)) {
        console.log(`  - ${p.nameZh} | ${p.title || '?'} | ${p.department || '?'} | ${p.email || '?'}`);
      }
    } catch (err) {
      console.log(`  Error: ${err instanceof Error ? err.message : err}`);
    }
    // Longer delay between unis
    await new Promise(r => setTimeout(r, 5000));
  }
}

main().catch(console.error);

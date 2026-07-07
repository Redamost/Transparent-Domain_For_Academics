// Test ONE university end-to-end — scrape 3 profiles to verify parsing works
import 'dotenv/config';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';

async function main() {
  const key = process.argv[2] || 'hit';
  console.log(`[Test] Testing ${key} with max 3 profiles...`);
  const { profiles } = await scrapeUniversity(key, 3);
  console.log(`[Test] Got ${profiles.length} profiles`);
  for (const p of profiles) {
    console.log(`  Name: ${p.nameZh} | Title: ${p.title} | Dept: ${p.department} | Email: ${p.email}`);
    console.log(`  Bio: ${p.bio?.slice(0, 100) || 'N/A'}`);
    console.log(`  Research: ${p.researchUpdates?.length || 0} | Pubs: ${p.publications?.length || 0}`);
    console.log('');
  }
}

main().catch(console.error);

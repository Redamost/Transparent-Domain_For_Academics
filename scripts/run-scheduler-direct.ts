// ─── Direct Scheduler Runner ───
// Calls runScheduledScrape() directly without needing the Next.js server.
// Usage: npx tsx scripts/run-scheduler-direct.ts

import 'dotenv/config';

import { runScheduledScrape } from '../src/lib/scraping/scheduler';

async function main() {
  console.log(`[${new Date().toISOString()}] Starting direct scheduled scrape...\n`);

  const startTime = Date.now();

  try {
    const result = await runScheduledScrape();
    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n[${new Date().toISOString()}] Scrape completed in ${duration.toFixed(1)}s`);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`[${new Date().toISOString()}] Scrape failed after ${duration.toFixed(1)}s`);
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

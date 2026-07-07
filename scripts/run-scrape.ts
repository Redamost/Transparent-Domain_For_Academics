// ─── Scrape Trigger CLI ───
// Calls the running Next.js server's scraping API endpoint.
// Designed to be invoked by Windows Task Scheduler or manually.
//
// Usage:
//   npx tsx scripts/run-scrape.ts
//
// Environment variables:
//   APP_URL  — base URL of the running app (default: http://localhost:3000)

import 'dotenv/config';

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const SCRAPE_ENDPOINT = `${BASE_URL}/api/admin/scraping/run`;

async function main() {
  console.log(`[${new Date().toISOString()}] Starting scheduled scrape...`);
  console.log(`Target: ${SCRAPE_ENDPOINT}`);

  const startTime = Date.now();

  try {
    const apiKey = process.env.SCRAPE_API_KEY;
    if (!apiKey) {
      console.warn('Warning: SCRAPE_API_KEY not set — authentication may fail.');
    }

    const response = await fetch(SCRAPE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    if (response.ok) {
      console.log(`[${new Date().toISOString()}] ✅ Scrape completed in ${(duration / 1000).toFixed(1)}s`);
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Scrape failed (HTTP ${response.status})`);
      console.error('Error:', JSON.stringify(result, null, 2));
      process.exit(1);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ❌ Scrape failed after ${(duration / 1000).toFixed(1)}s`);
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('Is the Next.js server running? Start it with: npm run dev');
    process.exit(1);
  }
}

main();

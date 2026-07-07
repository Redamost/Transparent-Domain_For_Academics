// ─── Development Scheduler ───
// Lightweight in-process scheduler for development convenience.
// Automatically runs the scraping pipeline at configured intervals
// while `next dev` is running. NOT intended for production use.
//
// To enable, import and call startDevScheduler() from a layout or page.

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startDevScheduler(intervalHours = 6): void {
  if (process.env.NODE_ENV !== 'development') {
    console.log('[DevScheduler] Not in development mode — skipping.');
    return;
  }

  if (intervalHandle) {
    console.log('[DevScheduler] Already running.');
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(
    `[DevScheduler] Starting dev scheduler — every ${intervalHours}h (${Math.round(intervalMs / 1000 / 60)}min).`
  );
  console.log('[DevScheduler] First scrape will run in 30 seconds...');

  // Run first scrape after a short delay (30s to let the server stabilize)
  setTimeout(() => {
    triggerScrape();
  }, 30_000);

  // Then run at the configured interval
  intervalHandle = setInterval(() => {
    triggerScrape();
  }, intervalMs);
}

export function stopDevScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[DevScheduler] Stopped.');
  }
}

export function getDevSchedulerStatus(): { running: boolean; isRunning: boolean } {
  return { running: intervalHandle !== null, isRunning };
}

async function triggerScrape(): Promise<void> {
  if (isRunning) {
    console.log('[DevScheduler] Previous scrape still running — skipping this cycle.');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`[DevScheduler] ===== Starting scrape at ${new Date().toISOString()} =====`);

    const { runScheduledScrape } = await import('./scheduler');
    const stats = await runScheduledScrape();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[DevScheduler] ===== Scrape complete in ${duration}s | Found: ${stats.totalScraped} | New: ${stats.totalInserted} | Updated: ${stats.totalUpdated} | Errors: ${stats.errors} =====`
    );
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[DevScheduler] Scrape failed after ${duration}s:`, error);
  } finally {
    isRunning = false;
  }
}

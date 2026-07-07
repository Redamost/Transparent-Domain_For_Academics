'use client';

import { useEffect } from 'react';

/**
 * Starts the development scheduler — automatically runs the scraping pipeline
 * at regular intervals while `next dev` is running.
 *
 * First scrape fires after 60s (server warm-up), then every 6 hours.
 * Only activates in NODE_ENV === 'development'.
 */
export function DevSchedulerInit() {
  useEffect(() => {
    let stopped = false;

    const start = async () => {
      const { startDevScheduler } = await import('@/lib/scraping/dev-scheduler');
      if (!stopped) {
        startDevScheduler(6); // Every 6 hours
      }
    };

    start().catch(() => {
      // Dev scheduler is optional — failure shouldn't crash the app
    });

    return () => {
      stopped = true;
    };
  }, []);

  return null; // No UI — background process only
}

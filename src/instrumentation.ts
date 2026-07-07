// ─── Next.js Instrumentation — Server-Side Initialization ───
// Runs once at server startup (NOT bundled into client code).
// Safe to import Node.js-only modules (prisma, pg, scraping, etc.)

export async function register() {
  // Only run dev scheduler in development mode
  if (process.env.NODE_ENV === 'development') {
    const { startDevScheduler } = await import('@/lib/scraping/dev-scheduler');
    startDevScheduler(6); // Every 6 hours
    console.log('[Instrumentation] Dev scheduler registered.');
  }
}

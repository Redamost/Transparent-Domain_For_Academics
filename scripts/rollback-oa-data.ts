// ─── Rollback OpenAlex data ───
// OpenAlex author matching quality for Chinese names is too low.
// This script removes all OPENALEX-sourced publications and resets
// hIndex/citationCount for all scraped scholars.
//
// Usage: npx tsx scripts/rollback-oa-data.ts [--dry-run]

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[Rollback] Cleaning OpenAlex data${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // 1. Count and delete OPENALEX publications
  const oaPubCount = await prisma.publication.count({ where: { source: 'OPENALEX' } });
  console.log(`[Rollback] OPENALEX publications: ${oaPubCount}`);

  if (!DRY_RUN && oaPubCount > 0) {
    await prisma.publication.deleteMany({ where: { source: 'OPENALEX' } });
    console.log(`[Rollback] Deleted ${oaPubCount} OPENALEX publications`);
  }

  // 2. Reset hIndex/citationCount for scraped scholars (keep seed data)
  const toReset = await prisma.person.count({
    where: {
      isActive: true,
      id: { not: { startsWith: 'seed-' } },
      OR: [
        { hIndex: { not: null } },
        { citationCount: { not: null } },
      ],
    },
  });
  console.log(`[Rollback] Scholars with metrics to reset: ${toReset}`);

  if (!DRY_RUN && toReset > 0) {
    await prisma.person.updateMany({
      where: {
        isActive: true,
        id: { not: { startsWith: 'seed-' } },
      },
      data: {
        hIndex: null,
        citationCount: null,
        // Keep publicationCount if it was set by the scraper
      },
    });
    console.log(`[Rollback] Reset metrics for ${toReset} scholars`);
  }

  // 3. Also clean up publicationCount if it was inflated by OA data
  // (PublicationCount from scraper was set to the count of extracted pubs which were garbage)

  console.log(`\n[Rollback] COMPLETE${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // Print final state
  const remainingPubs = await prisma.publication.count();
  console.log(`[Rollback] Remaining publications: ${remainingPubs}`);

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

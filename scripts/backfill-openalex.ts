// ─── One-time script: Backfill OpenAlex data from metadata into Person fields ───
// The old scraping pipeline wrote openalexHIndex / openalexCitations to metadata
// but never to the actual Person.hIndex / Person.citationCount columns.
// This script backfills those fields from metadata.
//
// Run: npx tsx scripts/backfill-openalex.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '.env') });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_URL!;
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

async function main() {
  // Find persons with OpenAlex data in metadata but null hIndex
  const candidates = await p.person.findMany({
    where: {
      isActive: true,
      hIndex: null,
    },
    select: {
      id: true,
      nameZh: true,
      metadata: true,
    },
  });

  // Filter in-memory: JSON path `not: null` has type issues in Prisma v7
  const persons = candidates.filter((p) => {
    const meta = p.metadata as Record<string, unknown> | null;
    return meta?.openalexId != null;
  });

  console.log(`Found ${persons.length} persons with OpenAlex metadata but null hIndex`);

  let updated = 0;
  let skipped = 0;

  for (const person of persons) {
    const meta = person.metadata as Record<string, unknown> | null;
    if (!meta) { skipped++; continue; }

    const hIndex = typeof meta.openalexHIndex === 'number' ? meta.openalexHIndex : null;
    const citations = typeof meta.openalexCitations === 'number' ? meta.openalexCitations : null;

    if (hIndex === null && citations === null) {
      skipped++;
      continue;
    }

    try {
      await p.person.update({
        where: { id: person.id },
        data: {
          hIndex: hIndex ?? undefined,
          citationCount: citations ?? undefined,
          metadata: {
            ...meta,
            openalexBackfilledAt: new Date().toISOString(),
          },
        },
      });
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Backfilled ${updated} persons...`);
      }
    } catch (err) {
      console.error(`  Error updating ${person.nameZh}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  console.log(`Done: ${updated} updated, ${skipped} skipped`);

  // Show new stats
  const [total, withHIndex, withCitations] = await Promise.all([
    p.person.count({ where: { isActive: true } }),
    p.person.count({ where: { isActive: true, hIndex: { not: null } } }),
    p.person.count({ where: { isActive: true, citationCount: { not: null } } }),
  ]);

  console.log(`\nNew stats: ${withHIndex}/${total} (${(withHIndex/total*100).toFixed(1)}%) have hIndex`);
  console.log(`${withCitations}/${total} (${(withCitations/total*100).toFixed(1)}%) have citations`);

  await p.$disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

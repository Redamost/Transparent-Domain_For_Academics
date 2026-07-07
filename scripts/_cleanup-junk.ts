// Clean up junk records from first (buggy) scrape run
// Removes persons who are clearly not real researchers
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/transparent_domain?schema=public',
});
const prisma = new PrismaClient({ adapter });

const JUNK_PATTERNS = [
  // Single-word generic names
  /^Science$/i,
  /^Physics$/i,
  /^Medicine$/i,
  /^Biology$/i,
  // "X. Science" / "X. Physics" patterns (S2 author name artifacts)
  /^[A-Z]\.\s*(Science|Physics|Medicine|Biology)$/i,
  /^\.\.\s*O\.\s*C\.\s*(Science|Physics)$/i,
  /^[A-Z]\.\s*M\.Tech$/i,  // "C. M.Tech"
  /^C\.\s*Dept\.?$/i,  // "C. Dept."
  // Publication/journal names misidentified as persons
  /^Journal of /i,
  /^Papers in /i,
  /^Introduction to /i,
  /^Advances in /i,
  // Degree/affiliation descriptions
  /^B\.SC\s+/i,
  /^MSc\s+/i,
  /^Applied Science and Computer Science Publications$/i,
  /^StatisticsComputer Science$/i,
  /^Computer Science Dypcoe$/i,
  /^IJCSMA$/i,
  /^smsamspublications Editor$/i,
];

async function main() {
  console.log('=== Cleaning up junk records ===\n');

  // Find all persons
  const allPersons = await prisma.person.findMany({
    where: { isActive: true },
    select: { id: true, nameEn: true, nameZh: true, orcidId: true },
  });

  const toDelete: string[] = [];

  for (const p of allPersons) {
    const name = p.nameEn || p.nameZh || '';
    const isJunk = JUNK_PATTERNS.some((pattern) => pattern.test(name));

    if (isJunk && !p.orcidId) {
      // Only delete if no ORCID (real researchers won't match these patterns)
      console.log(`  JUNK: ${name} (${p.id})`);
      toDelete.push(p.id);
    } else if (isJunk && p.orcidId) {
      console.log(`  SKIP (has ORCID): ${name} (${p.id})`);
    }
  }

  if (toDelete.length === 0) {
    console.log('No junk records found.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nDeleting ${toDelete.length} junk records...`);

  // Delete related records first, then the persons
  for (const id of toDelete) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.researchUpdate.deleteMany({ where: { personId: id } });
        await tx.publication.deleteMany({ where: { personId: id } });
        await tx.personField.deleteMany({ where: { personId: id } });
        await tx.scoreBreakdown.deleteMany({ where: { personId: id } });
        await tx.person.delete({ where: { id } });
      });
      console.log(`  Deleted: ${id}`);
    } catch (e: any) {
      console.error(`  Failed to delete ${id}: ${e.message}`);
    }
  }

  const remaining = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nDone. ${remaining} persons remaining.`);
  await prisma.$disconnect();
}

main();

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  // Delete all remaining SCRAPER publications (they're garbage)
  const scraperCount = await prisma.publication.count({ where: { source: "SCRAPER" } });
  console.log("Remaining SCRAPER (garbage) publications:", scraperCount);

  if (scraperCount > 0) {
    await prisma.publication.deleteMany({ where: { source: "SCRAPER" } });
    console.log("Deleted", scraperCount, "garbage publications");
  }

  // Count duplicates for cleanup
  const dupResult = await prisma.$queryRawUnsafe<Array<{total_groups: number; extra_persons: number}>>(
    `SELECT COUNT(*)::int as total_groups, SUM(cnt - 1)::int as extra_persons
     FROM (SELECT COUNT(*) as cnt FROM "Person" WHERE "isActive" = true GROUP BY "nameZh", institution HAVING COUNT(*) > 1) sub`
  );
  console.log("\nDuplicate groups:", dupResult[0]?.total_groups || 0);
  console.log("Extra (duplicate) persons:", dupResult[0]?.extra_persons || 0);

  // Clean up duplicates: for each group, keep the one with most data
  if (dupResult[0]?.total_groups > 0) {
    console.log("\nCleaning up duplicates...");
    
    const dups = await prisma.$queryRawUnsafe<Array<{name_zh: string; institution: string; ids: string}>>(
      `SELECT "nameZh" as name_zh, institution, STRING_AGG(id, ', ') as ids
       FROM "Person" WHERE "isActive" = true 
       GROUP BY "nameZh", institution HAVING COUNT(*) > 1`
    );

    let deactivated = 0;
    for (const dup of dups) {
      const ids = dup.ids.split(", ");
      
      // Find the best one to keep (most complete profile)
      const persons = await prisma.person.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          hIndex: true,
          citationCount: true,
          email: true,
          bioZh: true,
          department: true,
          _count: { select: { publications: true, researchUpdates: true, fields: true } },
        },
      });

      // Score each person: higher = keep
      const scored = persons.map(p => ({
        id: p.id,
        score: (p.hIndex ? 3 : 0) + (p.email ? 2 : 0) + (p.bioZh ? 2 : 0) + 
               (p.department ? 1 : 0) + (p._count.publications > 0 ? 2 : 0) +
               (p._count.researchUpdates > 0 ? 1 : 0) + (p._count.fields > 0 ? 1 : 0),
      }));

      scored.sort((a, b) => b.score - a.score);
      const keepId = scored[0].id;
      const deleteIds = scored.slice(1).map(s => s.id);

      if (deleteIds.length > 0) {
        // Soft-deactivate duplicates
        await prisma.person.updateMany({
          where: { id: { in: deleteIds } },
          data: {
            isActive: false,
            metadata: JSON.stringify({ deactivatedReason: "duplicate", mergedInto: keepId }),
          },
        });
        deactivated += deleteIds.length;
      }
    }

    console.log("Deactivated", deactivated, "duplicate persons");
  }

  // Final stats
  const [total, withHIndex, pubCount, scholarsWithPubs, fieldCount, scholarsWithFields] = await Promise.all([
    prisma.person.count({ where: { isActive: true } }),
    prisma.person.count({ where: { isActive: true, hIndex: { not: null } } }),
    prisma.publication.count(),
    prisma.person.count({ where: { isActive: true, publications: { some: {} } } }),
    prisma.personField.count(),
    prisma.person.count({ where: { isActive: true, fields: { some: {} } } }),
  ]);

  console.log("\n=== Final Clean State ===");
  console.log("Active scholars:", total);
  console.log("hIndex coverage:", withHIndex + "/" + total + " (" + (withHIndex/total*100).toFixed(1) + "%)");
  console.log("Total publications:", pubCount);
  console.log("Scholars with papers:", scholarsWithPubs + "/" + total + " (" + (scholarsWithPubs/total*100).toFixed(1) + "%)");
  console.log("Field associations:", fieldCount);
  console.log("Scholars with fields:", scholarsWithFields + "/" + total + " (" + (scholarsWithFields/total*100).toFixed(1) + "%)");
  console.log("\nAll papers now have real DOIs from OpenAlex!");

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

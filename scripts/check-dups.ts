import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  // Find duplicate scholars (same nameZh at same institution)
  const dups = await prisma.$queryRawUnsafe<Array<{
    name_zh: string;
    institution: string;
    count: number;
    ids: string;
  }>>(
    `SELECT "nameZh" as name_zh, institution, COUNT(*)::int as count, 
            STRING_AGG(id, ', ') as ids
     FROM "Person" 
     WHERE "isActive" = true 
     GROUP BY "nameZh", institution 
     HAVING COUNT(*) > 1 
     ORDER BY count DESC 
     LIMIT 20`
  );

  console.log("Top duplicate scholars (same name + institution):");
  console.log("");

  let totalDupGroups = 0;
  let totalDupPersons = 0;

  for (const d of dups) {
    console.log(`"${d.name_zh}" @ ${d.institution}: ${d.count} entries`);
    console.log(`  IDs: ${d.ids}`);
    totalDupGroups++;
    totalDupPersons += d.count - 1; // extra persons beyond the first
  }

  // Count total duplicates
  const totalDupResult = await prisma.$queryRawUnsafe<Array<{dup_groups: number; extra_persons: number}>>(
    `SELECT COUNT(*)::int as dup_groups, SUM(cnt - 1)::int as extra_persons
     FROM (SELECT COUNT(*) as cnt FROM "Person" WHERE "isActive" = true GROUP BY "nameZh", institution HAVING COUNT(*) > 1) sub`
  );

  console.log("");
  console.log(`Total duplicate groups: ${totalDupResult[0]?.dup_groups || 0}`);
  console.log(`Total extra (duplicate) persons: ${totalDupResult[0]?.extra_persons || 0}`);

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";

async function main() {
  const total = await prisma.person.count({
    where: { isActive: true, metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull } },
  });

  // Breakdown of data extracted from profile pages
  const [withPubs, withResearch, withComp, withEval, withAll] = await Promise.all([
    prisma.person.count({ where: { isActive: true, metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull }, publications: { some: {} } } }),
    prisma.person.count({ where: { isActive: true, metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull }, researchUpdates: { some: {} } } }),
    prisma.person.count({ where: { isActive: true, metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull }, competitionUpdates: { some: {} } } }),
    prisma.person.count({ where: { isActive: true, metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull }, evaluationUpdates: { some: {} } } }),
    prisma.person.count({ where: { isActive: true, metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull }, publications: { some: {} }, researchUpdates: { some: {} }, competitionUpdates: { some: {} }, evaluationUpdates: { some: {} } } }),
  ]);

  console.log("Scholars with profile pages crawled:", total);
  console.log("  With publications:", withPubs, "(" + (withPubs/total*100).toFixed(1) + "%)");
  console.log("  With research updates:", withResearch, "(" + (withResearch/total*100).toFixed(1) + "%)");
  console.log("  With competition updates:", withComp, "(" + (withComp/total*100).toFixed(1) + "%)");
  console.log("  With evaluation updates:", withEval, "(" + (withEval/total*100).toFixed(1) + "%)");
  console.log("  With ALL four:", withAll, "(" + (withAll/total*100).toFixed(1) + "%)");

  // How many have AT LEAST one of these?
  const withAny = await prisma.person.count({
    where: {
      isActive: true,
      metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull },
      OR: [
        { publications: { some: {} } },
        { researchUpdates: { some: {} } },
        { competitionUpdates: { some: {} } },
        { evaluationUpdates: { some: {} } },
      ],
    },
  });
  console.log("\n  With AT LEAST one type of content:", withAny, "(" + (withAny/total*100).toFixed(1) + "%)");

  // Sample some profile page URLs to understand their structure
  console.log("\nSample profile page URLs:");
  const sample = await prisma.person.findMany({
    where: {
      isActive: true,
      metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull },
      researchUpdates: { none: {} },
    },
    select: { nameZh: true, institution: true, metadata: true },
    take: 10,
  });

  for (const p of sample) {
    const meta = p.metadata as any;
    console.log("  " + p.nameZh + " @ " + p.institution);
    console.log("    URL: " + (meta.sourceUrl || "N/A"));
  }

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";

async function main() {
  const total = await prisma.person.count({ where: { isActive: true } });

  // Check how many have non-null metadata fields
  const withSourceUrl = await prisma.person.count({
    where: { isActive: true, metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull } },
  });
  const withEmail = await prisma.person.count({ where: { isActive: true, email: { not: null } } });
  const withWebsite = await prisma.person.count({ where: { isActive: true, website: { not: null } } });
  const withBio = await prisma.person.count({ where: { isActive: true, bioZh: { not: null } } });
  const withDept = await prisma.person.count({ where: { isActive: true, department: { not: null } } });

  console.log("Total active:", total);
  console.log("With sourceUrl in metadata:", withSourceUrl, "(" + (withSourceUrl/total*100).toFixed(1) + "%)");
  console.log("With email:", withEmail, "(" + (withEmail/total*100).toFixed(1) + "%)");
  console.log("With website:", withWebsite, "(" + (withWebsite/total*100).toFixed(1) + "%)");
  console.log("With bio:", withBio, "(" + (withBio/total*100).toFixed(1) + "%)");
  console.log("With department:", withDept, "(" + (withDept/total*100).toFixed(1) + "%)");

  // Check: scholars with sourceUrl but no research updates
  const withUrlNoResearch = await prisma.person.count({
    where: {
      isActive: true,
      metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull },
      researchUpdates: { none: {} },
    },
  });
  console.log("\nHave sourceUrl but NO research updates:", withUrlNoResearch);

  // Check: scholars with sourceUrl who DO have research updates
  const withUrlWithResearch = await prisma.person.count({
    where: {
      isActive: true,
      metadata: { path: ["sourceUrl"], not: Prisma.JsonNullValueFilter.JsonNull },
      researchUpdates: { some: {} },
    },
  });
  console.log("Have sourceUrl AND have research updates:", withUrlWithResearch);

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

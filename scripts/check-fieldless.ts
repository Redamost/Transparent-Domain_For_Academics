import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  // Sample 20 scholars without fields
  const sample = await prisma.person.findMany({
    where: { isActive: true, fields: { none: {} } },
    select: {
      id: true, nameZh: true, department: true, institution: true,
      bioZh: true, title: true,
      _count: { select: { researchUpdates: true, publications: true } },
    },
    take: 20,
  });

  for (const p of sample) {
    console.log(`"${p.nameZh}" | dept:"${p.department || "NULL"}" | inst:"${p.institution || "NULL"}" | title:"${p.title || "NULL"}" | bio:${p.bioZh ? "YES" : "NO"} | research:${p._count.researchUpdates} | pubs:${p._count.publications}`);
  }

  // Stats on what data is available for field-less scholars
  const total = await prisma.person.count({ where: { isActive: true, fields: { none: {} } } });
  const withDept = await prisma.person.count({ where: { isActive: true, fields: { none: {} }, department: { not: null } } });
  const withBio = await prisma.person.count({ where: { isActive: true, fields: { none: {} }, bioZh: { not: null } } });
  const withResearch = await prisma.person.count({ where: { isActive: true, fields: { none: {} }, researchUpdates: { some: {} } } });
  const withPubs = await prisma.person.count({ where: { isActive: true, fields: { none: {} }, publications: { some: {} } } });

  console.log(`\nTotal scholars without fields: ${total}`);
  console.log(`  With department: ${withDept} (${(withDept/total*100).toFixed(1)}%)`);
  console.log(`  With bio: ${withBio} (${(withBio/total*100).toFixed(1)}%)`);
  console.log(`  With research updates: ${withResearch} (${(withResearch/total*100).toFixed(1)}%)`);
  console.log(`  With publications: ${withPubs} (${(withPubs/total*100).toFixed(1)}%)`);

  // Sample department names
  const depts = await prisma.person.findMany({
    where: { isActive: true, fields: { none: {} }, department: { not: null } },
    select: { department: true },
    take: 30,
  });
  console.log(`\nSample departments:`);
  for (const d of depts) {
    console.log(`  "${d.department}"`);
  }

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

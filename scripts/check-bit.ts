import { prisma } from '../src/lib/prisma';

async function main() {
  // Check BIT scholars
  const bitScholars = await prisma.person.findMany({
    where: { institution: { contains: '理工' }, isActive: true },
    select: { nameZh: true, institution: true },
    take: 5,
  });
  console.log("Scholars with '理工' in institution:");
  for (const s of bitScholars) console.log(`  ${s.nameZh} @ ${s.institution}`);

  // Check if 北京理工大学 has any data
  const bitCount = await prisma.person.count({ where: { institution: '北京理工大学', isActive: true } });
  console.log(`\n北京理工大学 count: ${bitCount}`);

  // Check recently added scholars metadata
  const recent = await prisma.person.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { nameZh: true, institution: true, metadata: true },
    take: 10,
  });
  console.log("\nMost recently added scholars:");
  for (const s of recent) {
    const meta = s.metadata as any;
    console.log(`  ${s.nameZh} @ ${s.institution} (key: ${meta?.universityKey || 'N/A'})`);
  }

  await prisma.$disconnect();
}
main();

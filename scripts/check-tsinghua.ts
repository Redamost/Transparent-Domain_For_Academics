import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const ts = await prisma.person.findMany({
    where: { institution: '清华大学', isActive: true },
    select: { nameZh: true, bioZh: true, department: true },
    take: 15,
  });
  console.log('Tsinghua scholars (first 15):');
  for (const p of ts) {
    console.log(`  ${p.nameZh} | bio: ${(p.bioZh || 'NONE').slice(0, 100)} | dept: ${p.department}`);
  }
  const total = await prisma.person.count({ where: { institution: '清华大学', isActive: true } });
  console.log(`\nTotal Tsinghua: ${total}`);

  // Check fields for Tsinghua
  const withFields = await prisma.person.count({
    where: { institution: '清华大学', isActive: true, fields: { some: {} } },
  });
  console.log(`Tsinghua with fields: ${withFields}`);

  // Check a sample bio for keyword matching
  const sample = await prisma.person.findFirst({
    where: { institution: '清华大学', isActive: true, bioZh: { not: null } },
    select: { nameZh: true, bioZh: true },
  });
  if (sample) {
    console.log(`\nSample bio for ${sample.nameZh}:`);
    console.log(sample.bioZh?.slice(0, 300));
  }

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

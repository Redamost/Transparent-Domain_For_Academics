import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  // Sample of scholars with bioZh but no fields
  const noFieldWithBio = await prisma.person.findMany({
    where: {
      isActive: true,
      id: { not: { startsWith: 'seed-' } },
      fields: { none: {} },
      bioZh: { not: null },
    },
    select: { nameZh: true, institution: true, department: true, bioZh: true },
    take: 30,
  });

  console.log(`=== ${noFieldWithBio.length} scholars with bioZh but no fields ===\n`);
  for (const s of noFieldWithBio) {
    console.log(`--- ${s.nameZh} | ${s.institution} | ${s.department || '?'}`);
    console.log(`  bio: ${s.bioZh?.slice(0, 200).replace(/\n/g, ' ')}`);
    console.log('');
  }

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

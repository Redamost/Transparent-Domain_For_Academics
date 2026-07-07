import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.person.count({ where: { isActive: true } });
  console.log('Total scholars:', total);

  const byInst = await prisma.person.groupBy({
    by: ['institution'],
    where: { isActive: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  console.log('\nPer institution:');
  for (const g of byInst) {
    const key = (g.institution || 'N/A').padEnd(20);
    console.log(`  ${key} ${g._count.id}`);
  }

  const withBio = await prisma.person.count({ where: { isActive: true, bioZh: { not: null } } });
  const withEmail = await prisma.person.count({ where: { isActive: true, email: { not: null } } });
  const withDept = await prisma.person.count({ where: { isActive: true, department: { not: null } } });
  const withFields = await prisma.person.count({ where: { isActive: true, fields: { some: {} } } });
  const withHIndex = await prisma.person.count({ where: { isActive: true, hIndex: { not: null } } });
  console.log('\nQuality:');
  console.log(`  Bio:       ${withBio}/${total} (${(withBio/total*100).toFixed(1)}%)`);
  console.log(`  Email:     ${withEmail}/${total} (${(withEmail/total*100).toFixed(1)}%)`);
  console.log(`  Department: ${withDept}/${total} (${(withDept/total*100).toFixed(1)}%)`);
  console.log(`  Fields:    ${withFields}/${total} (${(withFields/total*100).toFixed(1)}%)`);
  console.log(`  hIndex:    ${withHIndex}/${total} (${(withHIndex/total*100).toFixed(1)}%)`);

  // Scholars without fields but with bio
  const noFieldWithBio = await prisma.person.count({
    where: { isActive: true, bioZh: { not: null }, fields: { none: {} } },
  });
  console.log(`\nNo fields but have bio: ${noFieldWithBio}`);

  // Scholars without fields AND without bio
  const noFieldNoBio = await prisma.person.count({
    where: { isActive: true, bioZh: null, fields: { none: {} } },
  });
  console.log(`No fields and no bio:   ${noFieldNoBio}`);

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

// Check PKU scholars quality
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const pku = await prisma.person.findMany({
    where: { institution: '北京大学', isActive: true },
    select: { nameZh: true, title: true, department: true, bioZh: true, email: true, website: true },
    take: 20,
  });
  console.log('PKU scholars (first 20):');
  for (const p of pku) {
    console.log(`  ${(p.nameZh||'?').padEnd(16)} | ${(p.title||'?').padEnd(10)} | ${(p.department||'?').padEnd(20)} | bio:${p.bioZh?'Y':'N'} | email:${p.email||'N'}`);
  }

  const total = await prisma.person.count({ where: { institution: '北京大学', isActive: true } });
  const withBio = await prisma.person.count({ where: { institution: '北京大学', isActive: true, bioZh: { not: null } } });
  const withEmail = await prisma.person.count({ where: { institution: '北京大学', isActive: true, email: { not: null } } });
  const withFields = await prisma.person.count({ where: { institution: '北京大学', isActive: true, fields: { some: {} } } });
  console.log(`\nTotal: ${total} | Bio: ${withBio} | Email: ${withEmail} | Fields: ${withFields}`);

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

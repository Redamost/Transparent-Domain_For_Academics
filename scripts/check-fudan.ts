import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.person.count({ where: { institution: '复旦大学', isActive: true } });
  const withBio = await prisma.person.count({ where: { institution: '复旦大学', isActive: true, bioZh: { not: null } } });
  const withEmail = await prisma.person.count({ where: { institution: '复旦大学', isActive: true, email: { not: null } } });
  const withDept = await prisma.person.count({ where: { institution: '复旦大学', isActive: true, department: { not: null } } });
  const withTitle = await prisma.person.count({ where: { institution: '复旦大学', isActive: true, title: { not: null } } });
  console.log(`Fudan: total=${total} bio=${withBio} email=${withEmail} dept=${withDept} title=${withTitle}`);

  const sample = await prisma.person.findMany({ where: { institution: '复旦大学', isActive: true }, select: { nameZh: true, title: true, department: true, email: true, bioZh: true }, take: 15 });
  for (const p of sample) {
    console.log(`  ${(p.nameZh||'?').padEnd(10)} | ${(p.title||'?').padEnd(8)} | ${(p.department||'?').padEnd(16)} | email:${p.email||'N'} | bio:${p.bioZh?'Y':'N'}`);
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

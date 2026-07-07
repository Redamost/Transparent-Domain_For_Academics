import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const pubs = await prisma.publication.findMany({
    where: { source: 'SCRAPER' },
    select: { id: true, title: true, person: { select: { nameZh: true } } },
  });
  for (const p of pubs) {
    console.log(`[${p.person.nameZh}] ${p.title.slice(0, 150)}`);
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

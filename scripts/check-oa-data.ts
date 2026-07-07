import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const hCount = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, hIndex: { not: null } },
  });
  console.log('Scraped scholars with hIndex:', hCount);

  const oaPubs = await prisma.publication.count({ where: { source: 'OPENALEX' } });
  console.log('OPENALEX publications:', oaPubs);

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

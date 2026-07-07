import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const result = await prisma.publication.deleteMany({ where: { source: 'SCRAPER' } });
  console.log(`Deleted ${result.count} SCRAPER publications`);
  const remaining = await prisma.publication.count();
  console.log(`Remaining publications: ${remaining}`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

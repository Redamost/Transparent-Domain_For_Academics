import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BAD_KEYWORDS = [
  'university', 'institute', 'college', 'school', 'department',
  'laboratory', 'lab', 'center', 'centre', 'academy', 'society',
  'foundation', 'corporation', 'limited', 'ltd', 'inc',
  'journal', 'conference', 'symposium', 'transaction', 'bulletin',
  'science', 'technology', 'engineering', 'research',
  'computational', 'computation', 'informatics', 'computing',
  'intelligence', 'learning', 'evolutionary', 'affine',
  'platform', 'information', 'applied', 'data',
];

async function main() {
  const all = await prisma.person.findMany({
    where: { nameEn: { not: null } },
    select: { id: true, nameZh: true, nameEn: true },
  });

  let cleaned = 0;
  for (const p of all) {
    const lower = (p.nameEn || '').toLowerCase();
    if (BAD_KEYWORDS.some((kw) => lower.includes(kw))) {
      await prisma.person.update({
        where: { id: p.id },
        data: { nameEn: null },
      });
      console.log('Cleaned: ' + p.nameZh + ' <- "' + p.nameEn + '"');
      cleaned++;
    }
  }

  console.log('\nCleaned ' + cleaned + ' bad nameEn values');
  const remaining = await prisma.person.count({ where: { nameEn: { not: null } } });
  const total = await prisma.person.count();
  console.log('Persons with valid nameEn: ' + remaining + '/' + total);
  await prisma.$disconnect();
}

main();

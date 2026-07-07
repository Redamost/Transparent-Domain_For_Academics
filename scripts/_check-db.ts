import { prisma } from '../src/lib/prisma';

async function main() {
  try {
    const fields = await prisma.field.count();
    const persons = await prisma.person.count();
    console.log(`Fields: ${fields} | Persons: ${persons}`);

    const sampleFields = await prisma.field.findMany({
      select: { slug: true, nameEn: true },
      take: 5,
    });
    console.log('Sample fields:', JSON.stringify(sampleFields, null, 2));

    if (persons > 0) {
      const sample = await prisma.person.findFirst({
        select: { id: true, nameZh: true, nameEn: true, orcidId: true, lastScrapedAt: true },
      });
      console.log('Sample person:', JSON.stringify(sample, null, 2));
    }
  } catch (e: any) {
    console.error('DB check failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

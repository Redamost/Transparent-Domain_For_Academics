import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  // Check scraped scholars: do they have metadata with research interests?
  const sample = await prisma.person.findMany({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } } },
    select: { nameZh: true, institution: true, metadata: true },
    take: 5,
  });
  console.log('=== 爬取学者 metadata 样本 ===');
  for (const p of sample) {
    console.log(`${p.nameZh} | ${p.institution}`);
    console.log(`  metadata: ${JSON.stringify(p.metadata)?.slice(0, 300)}`);
  }

  // Check existing Field table
  const fields = await prisma.field.findMany({
    select: { slug: true, nameZh: true, level: true },
    take: 20,
  });
  console.log('\n=== Field 表 ===');
  for (const f of fields) {
    console.log(`  ${f.slug} | ${f.nameZh} | level: ${f.level}`);
  }
  const fieldCount = await prisma.field.count();
  console.log(`Total fields: ${fieldCount}`);

  // Check if any scraped scholars have researchInterest data in the raw scrape data
  // by looking at publications with titles that look like research areas
  // Actually let's look at what the scraper puts in researchTopics
  console.log('\n=== 出版物种类的统计 ===');
  const pubStats = await prisma.publication.groupBy({
    by: ['source'],
    _count: true,
  });
  console.log(JSON.stringify(pubStats, null, 2));

  // Check publication types - how many are real vs garbage
  const allPubs = await prisma.publication.findMany({
    where: { person: { id: { not: { startsWith: 'seed-' } } } },
    select: { title: true },
  });

  // Count suspicious publications
  let garbageCount = 0;
  for (const p of allPubs) {
    const t = p.title || '';
    if (t.includes('发表论文') || t.includes('发表') && t.includes('篇') ||
        t.startsWith('在') && (t.includes('发表') || t.includes('论文')) ||
        t.includes('余篇') || t.includes('多篇') ||
        /^\D{0,10}\d+篇/.test(t)) {
      garbageCount++;
    }
  }
  console.log(`\n疑似非真实论文（\"发表XX篇\"等描述性文本）: ${garbageCount} / ${allPubs.length}`);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const names = ['陈娟','黄岚','杜伟','刘桂霞','李文辉','郭东','高尚','车喜龙','包铁'];
  for (const name of names) {
    const p = await prisma.person.findFirst({
      where: { nameZh: name, id: { not: { startsWith: 'seed-' } } },
      select: {
        nameZh: true, institution: true, department: true,
        hIndex: true, citationCount: true, publicationCount: true,
        metadata: true,
        publications: { select: { title: true, year: true, doi: true, citationCount: true, journal: true }, take: 3 },
      }
    });
    if (p) {
      const meta = p.metadata as any;
      console.log(`--- ${p.nameZh} | ${p.institution} | ${p.department}`);
      console.log(`  hIndex: ${p.hIndex} | citations: ${p.citationCount} | pubs: ${p.publicationCount}`);
      console.log(`  OA confidence: ${meta?.openalexConfidence}`);
      console.log(`  OA ID: ${meta?.openalexId}`);
      console.log('  Sample papers:');
      for (const pub of p.publications.slice(0, 3)) {
        console.log(`    - ${pub.title?.slice(0, 100)} (${pub.year}) | ${pub.journal?.slice(0, 40)}`);
      }
      console.log('');
    }
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

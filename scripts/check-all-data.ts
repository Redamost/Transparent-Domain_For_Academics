// ─── Full data completeness check ───
// Usage: npx tsx scripts/check-all-data.ts

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.person.count({ where: { isActive: true } });
  const seed = await prisma.person.count({ where: { isActive: true, id: { startsWith: 'seed-' } } });
  const scraped = total - seed;

  console.log('=== 总体统计 ===');
  console.log(`总学者数: ${total}`);
  console.log(`种子学者: ${seed}`);
  console.log(`爬取学者: ${scraped}`);

  // Academic metrics
  const hIndex = await prisma.person.count({ where: { isActive: true, hIndex: { not: null } } });
  const citationCount = await prisma.person.count({ where: { isActive: true, citationCount: { not: null } } });
  const pubCount = await prisma.person.count({ where: { isActive: true, publicationCount: { not: null } } });

  console.log('\n=== 学术指标 ===');
  console.log(`hIndex 有数据: ${hIndex} (${(hIndex/total*100).toFixed(1)}%)`);
  console.log(`citationCount 有数据: ${citationCount} (${(citationCount/total*100).toFixed(1)}%)`);
  console.log(`publicationCount 有数据: ${pubCount} (${(pubCount/total*100).toFixed(1)}%)`);

  // Scraped scholars metrics
  const scrapedHIndex = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, hIndex: { not: null } }
  });
  const scrapedCitations = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, citationCount: { not: null } }
  });
  console.log(`\n爬取学者 hIndex 有数据: ${scrapedHIndex} / ${scraped}`);
  console.log(`爬取学者 citationCount 有数据: ${scrapedCitations} / ${scraped}`);

  // Publications
  const pubTotal = await prisma.publication.count();
  const scholarsWithPubs = await prisma.person.count({
    where: { isActive: true, publications: { some: {} } }
  });
  console.log('\n=== 论文 ===');
  console.log(`总论文数: ${pubTotal}`);
  console.log(`有论文的学者数: ${scholarsWithPubs} (${(scholarsWithPubs/total*100).toFixed(1)}%)`);

  // Scraped scholars with pubs
  const scrapedWithPubs = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, publications: { some: {} } }
  });
  console.log(`爬取学者有论文: ${scrapedWithPubs} / ${scraped}`);

  // Research Fields
  const fieldsTotal = await prisma.personField.count();
  const scholarsWithFields = await prisma.person.count({
    where: { isActive: true, fields: { some: {} } }
  });
  console.log('\n=== 研究领域 ===');
  console.log(`PersonField 关联总数: ${fieldsTotal}`);
  console.log(`有研究领域的学者: ${scholarsWithFields} (${(scholarsWithFields/total*100).toFixed(1)}%)`);

  const scrapedWithFields = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, fields: { some: {} } }
  });
  console.log(`爬取学者有研究领域: ${scrapedWithFields} / ${scraped}`);

  // Updates
  const researchUpdates = await prisma.researchUpdate.count();
  const competitionUpdates = await prisma.competitionUpdate.count();
  const evaluationUpdates = await prisma.evaluationUpdate.count();
  const scholarsWithResearch = await prisma.person.count({
    where: { isActive: true, researchUpdates: { some: {} } }
  });
  const scholarsWithCompetition = await prisma.person.count({
    where: { isActive: true, competitionUpdates: { some: {} } }
  });
  const scholarsWithEvaluation = await prisma.person.count({
    where: { isActive: true, evaluationUpdates: { some: {} } }
  });

  console.log('\n=== 动态数据 ===');
  console.log(`研究动态总数: ${researchUpdates} | 有数据的学者: ${scholarsWithResearch}`);
  console.log(`竞赛动态总数: ${competitionUpdates} | 有数据的学者: ${scholarsWithCompetition}`);
  console.log(`评价动态总数: ${evaluationUpdates} | 有数据的学者: ${scholarsWithEvaluation}`);

  // Scraped scholars with updates
  const scrapedWithResearch = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, researchUpdates: { some: {} } }
  });
  const scrapedWithCompetition = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, competitionUpdates: { some: {} } }
  });
  const scrapedWithEvaluation = await prisma.person.count({
    where: { isActive: true, id: { not: { startsWith: 'seed-' } }, evaluationUpdates: { some: {} } }
  });
  console.log(`爬取学者有研究动态: ${scrapedWithResearch} / ${scraped}`);
  console.log(`爬取学者有竞赛动态: ${scrapedWithCompetition} / ${scraped}`);
  console.log(`爬取学者有评价动态: ${scrapedWithEvaluation} / ${scraped}`);

  // Google Scholar ID
  const scholarsWithGS = await prisma.person.count({
    where: { isActive: true, googleScholarId: { not: null } }
  });
  console.log('\n=== Google Scholar ===');
  console.log(`有Google Scholar ID的学者: ${scholarsWithGS} (${(scholarsWithGS/total*100).toFixed(1)}%)`);

  // Publication field completeness check for scraped scholars
  console.log('\n=== 论文详情（爬取学者） ===');
  const scrapedPubs = await prisma.publication.findMany({
    where: { person: { id: { not: { startsWith: 'seed-' } } } },
    select: { title: true, doi: true, citationCount: true, year: true, journal: true },
    take: 10,
  });
  console.log(`样本 (前10篇):`);
  for (const p of scrapedPubs) {
    console.log(`  - "${p.title?.slice(0,60)}" | doi:${p.doi ? 'YES' : 'NO'} | citations:${p.citationCount ?? 'null'} | year:${p.year} | journal:${p.journal ?? 'null'}`);
  }

  const pubsWithDoi = await prisma.publication.count({
    where: { person: { id: { not: { startsWith: 'seed-' } } }, doi: { not: null } }
  });
  console.log(`有DOI的论文: ${pubsWithDoi} / ${pubTotal}`);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

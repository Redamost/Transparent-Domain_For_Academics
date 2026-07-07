// ─── Final Data Completeness Check ───
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.person.count({ where: { isActive: true } });
  const seed = await prisma.person.count({ where: { isActive: true, id: { startsWith: 'seed-' } } });
  const scraped = total - seed;

  console.log('╔══════════════════════════════╗');
  console.log('║   FINAL DATA CHECK          ║');
  console.log('╚══════════════════════════════╝');
  console.log(`Total: ${total} | Seed: ${seed} | Scraped: ${scraped}\n`);

  // Department
  const dept = await prisma.person.count({ where: { isActive: true, department: { not: null } } });
  const scrapedDept = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, department: { not: null } } });
  console.log(`📋 院系 Department:  ${dept}/${total} (${(dept/total*100).toFixed(1)}%) | Scraped: ${scrapedDept}/${scraped}`);

  // Bio
  const bio = await prisma.person.count({ where: { isActive: true, bioZh: { not: null } } });
  const scrapedBio = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, bioZh: { not: null } } });
  console.log(`📝 概览 Bio:        ${bio}/${total} (${(bio/total*100).toFixed(1)}%) | Scraped: ${scrapedBio}/${scraped}`);

  // Email
  const email = await prisma.person.count({ where: { isActive: true, email: { not: null } } });
  const scrapedEmail = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, email: { not: null } } });
  console.log(`📧 联系方式 Email:  ${email}/${total} (${(email/total*100).toFixed(1)}%) | Scraped: ${scrapedEmail}/${scraped}`);

  // Website
  const website = await prisma.person.count({ where: { isActive: true, website: { not: null } } });
  const scrapedWebsite = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, website: { not: null } } });
  console.log(`🌐 主页 Website:    ${website}/${total} (${(website/total*100).toFixed(1)}%) | Scraped: ${scrapedWebsite}/${scraped}`);

  // Title
  const title = await prisma.person.count({ where: { isActive: true, title: { not: null } } });
  const scrapedTitle = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, title: { not: null } } });
  console.log(`🎓 职称 Title:      ${title}/${total} (${(title/total*100).toFixed(1)}%) | Scraped: ${scrapedTitle}/${scraped}`);

  console.log('');

  // Academic metrics
  const hIndex = await prisma.person.count({ where: { isActive: true, hIndex: { not: null } } });
  const citations = await prisma.person.count({ where: { isActive: true, citationCount: { not: null } } });
  const pubCount = await prisma.person.count({ where: { isActive: true, publicationCount: { not: null } } });
  const scrapedH = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, hIndex: { not: null } } });
  const scrapedCit = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, citationCount: { not: null } } });
  console.log(`📊 hIndex:          ${hIndex}/${total} (${(hIndex/total*100).toFixed(1)}%) | Scraped: ${scrapedH}/${scraped}  ⚠️ API不可靠`);
  console.log(`📊 citationCount:   ${citations}/${total} (${(citations/total*100).toFixed(1)}%) | Scraped: ${scrapedCit}/${scraped}  ⚠️ API不可靠`);
  console.log(`📊 publicationCount:${pubCount}/${total} (${(pubCount/total*100).toFixed(1)}%)`);

  // Research Fields
  const fields = await prisma.personField.count();
  const withFields = await prisma.person.count({ where: { isActive: true, fields: { some: {} } } });
  const scrapedFields = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, fields: { some: {} } } });
  console.log(`\n🔬 研究领域 Fields: ${fields}条关联 | 有数据的学者: ${withFields}/${total} (${(withFields/total*100).toFixed(1)}%) | Scraped: ${scrapedFields}/${scraped} ✅`);

  // Publications
  const allPubs = await prisma.publication.count();
  const withPubs = await prisma.person.count({ where: { isActive: true, publications: { some: {} } } });
  const scrapedPubs = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, publications: { some: {} } } });
  console.log(`📄 论文 Publications:${allPubs}篇 | 有论文的学者: ${withPubs}/${total} (${(withPubs/total*100).toFixed(1)}%) | Scraped: ${scrapedPubs}/${scraped} ⚠️`);

  // Updates
  const rUp = await prisma.researchUpdate.count();
  const cUp = await prisma.competitionUpdate.count();
  const eUp = await prisma.evaluationUpdate.count();
  const withR = await prisma.person.count({ where: { isActive: true, researchUpdates: { some: {} } } });
  const withC = await prisma.person.count({ where: { isActive: true, competitionUpdates: { some: {} } } });
  const withE = await prisma.person.count({ where: { isActive: true, evaluationUpdates: { some: {} } } });
  const scrapedR = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, researchUpdates: { some: {} } } });
  const scrapedC = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, competitionUpdates: { some: {} } } });
  const scrapedE = await prisma.person.count({ where: { isActive: true, id: { not: { startsWith: 'seed-' } }, evaluationUpdates: { some: {} } } });

  console.log(`\n📢 研究动态:       ${rUp}条 | 学者: ${withR}/${total} (${(withR/total*100).toFixed(1)}%) | Scraped: ${scrapedR}/${scraped}`);
  console.log(`🏆 竞赛动态:       ${cUp}条 | 学者: ${withC}/${total} (${(withC/total*100).toFixed(1)}%) | Scraped: ${scrapedC}/${scraped}`);
  console.log(`📋 评价动态:       ${eUp}条 | 学者: ${withE}/${total} (${(withE/total*100).toFixed(1)}%) | Scraped: ${scrapedE}/${scraped}`);

  // Check how many scholars with NO fields have bioZh
  const noFieldsButBio = await prisma.person.count({
    where: {
      isActive: true,
      id: { not: { startsWith: 'seed-' } },
      fields: { none: {} },
      bioZh: { not: null },
    },
  });
  const noFieldsNoBio = await prisma.person.count({
    where: {
      isActive: true,
      id: { not: { startsWith: 'seed-' } },
      fields: { none: {} },
      bioZh: null,
    },
  });
  console.log(`\n🔍 无研究领域的学者分析:`);
  console.log(`  有bioZh但无匹配: ${noFieldsButBio}`);
  console.log(`  无bioZh: ${noFieldsNoBio}`);

  // Top fields assigned
  console.log(`\n🏷️  Top 10 热门研究领域:`);
  const topFields = await prisma.personField.groupBy({
    by: ['fieldId'],
    _count: { fieldId: true },
    orderBy: { _count: { fieldId: 'desc' } },
    take: 10,
  });
  for (const tf of topFields) {
    const f = await prisma.field.findUnique({ where: { id: tf.fieldId }, select: { nameZh: true, slug: true } });
    console.log(`  ${f?.nameZh || '?'} (${f?.slug}): ${tf._count.fieldId} scholars`);
  }

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

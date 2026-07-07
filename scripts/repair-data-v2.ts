import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { inferFields, normalizeResearchText } from "../src/lib/scraping/field-inference";

async function main() {
  console.log("=== Data Repair Script v2 ===\n");

  // ── 1. Clean up garbage papers ──
  console.log("1. Cleaning up garbage papers...");
  const allPubs = await prisma.publication.findMany({
    where: { source: "SCRAPER" },
    select: { id: true, title: true },
  });
  console.log(`   Total SCRAPER publications: ${allPubs.length}`);

  const garbagePatterns = [
    /发表了?\d+余?篇/, /共发表/, /发表论文/, /SCI.{0,5}收录/, /EI.{0,5}收录/,
    /引用.*次|被引.*次/, /代表性.*论文/, /近[三五]年/, /主要.*成果/,
    /包括[:：]/, /如下[:：]/, /论文列表/, /发表时间/, /著作[:：]/,
    /期刊.*论文/, /会议.*论文/, /第一作者/, /通讯作者/,
    /担任.*主编|担任.*编委/, /主持.*项目|承担.*项目/,
    /研究方向/, /研究领域/, /获奖|荣获|获得.*奖/,
    /博士学位|硕士学位|学士学位/, /邮箱[:：]|电话[:：]|地址[:：]/,
    /教授|副教授|讲师|研究员/, /博士生导师|硕士生导师/,
    /^\d{4}年/, /^\d{4}-\d{4}/, /个人主页|个人简介|教师简介/,
    /联系方式/, /教育背景/, /工作经历/,
  ];

  const garbageIds: string[] = [];
  for (const pub of allPubs) {
    let isGarbage = false;
    if (pub.title.length > 250) { isGarbage = true; }
    if (!isGarbage) {
      for (const pattern of garbagePatterns) {
        if (pattern.test(pub.title)) { isGarbage = true; break; }
      }
    }
    if (!isGarbage) {
      const looksLikePaper =
        /(?:19|20)\d{2}/.test(pub.title) ||
        /[\[\(].*[\]\)]/.test(pub.title) ||
        /[「『""].*[」』""]/.test(pub.title) ||
        /学报|期刊|杂志|会议|Journal|Conference|Proc\.|IEEE|ACM|Springer/.test(pub.title) ||
        /第[一二三四五六七八九十\d]+[卷期页]/.test(pub.title) ||
        /DOI/i.test(pub.title);
      if (!looksLikePaper) { isGarbage = true; }
    }
    if (isGarbage) garbageIds.push(pub.id);
  }

  if (garbageIds.length > 0) {
    await prisma.publication.deleteMany({ where: { id: { in: garbageIds } } });
    console.log(`   Deleted ${garbageIds.length} garbage papers`);
  }

  // ── 2. Backfill fields using metadata sourceUrl ──
  console.log("\n2. Backfilling field assignments (using metadata sourceUrl)...");

  const totalActive = await prisma.person.count({ where: { isActive: true } });

  // Process in batches
  let totalAssigned = 0;
  let totalSkipped = 0;
  const BATCH_SIZE = 500;

  for (let offset = 0; offset < totalActive; offset += BATCH_SIZE) {
    const personsWithoutFields = await prisma.person.findMany({
      where: {
        isActive: true,
        fields: { none: {} },
      },
      select: {
        id: true,
        nameZh: true,
        department: true,
        institution: true,
        bioZh: true,
        metadata: true,
        researchUpdates: { select: { title: true, description: true }, take: 20 },
        publications: { select: { title: true }, take: 10 },
      },
      take: BATCH_SIZE,
    });

    if (personsWithoutFields.length === 0) break;

    for (const person of personsWithoutFields) {
      const meta = (person.metadata || {}) as Record<string, unknown>;
      const sourceUrl = typeof meta.sourceUrl === 'string' ? meta.sourceUrl : null;
      const universityKey = typeof meta.universityKey === 'string' ? meta.universityKey : null;

      const researchText = person.researchUpdates.length > 0
        ? person.researchUpdates.map(u => `${u.title} ${u.description || ""}`).join("; ")
        : null;

      const inferredSlugs = inferFields({
        researchText,
        department: person.department,
        bio: person.bioZh,
        publications: person.publications.map(p => ({ title: p.title })),
        institution: person.institution,
        universityKey,
        sourceUrl,
      });

      if (inferredSlugs.length > 0) {
        const fieldRecords = await prisma.field.findMany({
          where: { slug: { in: inferredSlugs } },
          select: { id: true, slug: true },
        });

        if (fieldRecords.length > 0) {
          await prisma.personField.createMany({
            data: fieldRecords.map((f, i) => ({
              personId: person.id,
              fieldId: f.id,
              isPrimary: i === 0,
            })),
            skipDuplicates: true,
          });
          totalAssigned++;
        } else {
          totalSkipped++;
        }
      } else {
        totalSkipped++;
      }
    }

    console.log(`   Batch ${offset/BATCH_SIZE + 1}: assigned ${totalAssigned} so far...`);
  }

  console.log(`   Assigned fields: ${totalAssigned} scholars`);
  console.log(`   Skipped: ${totalSkipped} scholars`);

  // ── 3. Report ──
  console.log("\n3. Final stats:");
  const [pubCount, scholarsWithPubs, fieldAssocCount, scholarsWithFields] = await Promise.all([
    prisma.publication.count(),
    prisma.person.count({ where: { isActive: true, publications: { some: {} } } }),
    prisma.personField.count(),
    prisma.person.count({ where: { isActive: true, fields: { some: {} } } }),
  ]);

  console.log(`   Publications: ${pubCount} total`);
  console.log(`   Scholars with papers: ${scholarsWithPubs} / ${totalActive}`);
  console.log(`   PersonField associations: ${fieldAssocCount}`);
  console.log(`   Scholars with fields: ${scholarsWithFields} / ${totalActive} (${(scholarsWithFields/totalActive*100).toFixed(1)}%)`);

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

// Targeted re-scrape: re-fetch profile pages for scholars with sourceUrl but poor data
// Uses the improved parseProfileHtml patterns to extract better data.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchAndParseProfile, getUniversityConfig } from "../src/lib/scraping/cn-university";

const REQUEST_DELAY_MS = 1500;
const BATCH_SIZE = 40;

// University name → config key mapping (must match cn-university.ts UNIVERSITY_CONFIGS)
const INST_KEY_MAP: Record<string, string> = {
  '清华大学': 'tsinghua', '北京大学': 'pku', '浙江大学': 'zju',
  '复旦大学': 'fudan', '上海交通大学': 'sjtu', '中国科学技术大学': 'ustc',
  '南京大学': 'nju', '哈尔滨工业大学': 'hit', '西安交通大学': 'xjtu',
  '武汉大学': 'whu', '中山大学': 'sysu', '华中科技大学': 'hust',
  '同济大学': 'tongji', '北京航空航天大学': 'beihang', '四川大学': 'sichuan',
  '东南大学': 'seu', '中国人民大学': 'ruc', '南开大学': 'nankai',
  '天津大学': 'tianjin', '北京理工大学': 'bit', '大连理工大学': 'dlut',
  '吉林大学': 'jlu', '山东大学': 'sdu', '厦门大学': 'xmu',
  '兰州大学': 'lzu', '西北工业大学': 'nwpu', '华南理工大学': 'scut',
  '中南大学': 'csu', '湖南大学': 'hnu', '东北大学': 'neu',
  '重庆大学': 'cqu', '华东师范大学': 'ecnu', '北京师范大学': 'bnu',
  '电子科技大学': 'uestc', '中国农业大学': 'cau', '国防科技大学': 'nudt',
  '西北农林科技大学': 'nwafu', '中央民族大学': 'muc',
  '中国海洋大学': 'ouc', '西安电子科技大学': 'xidian',
};

async function main() {
  console.log("=== Targeted Re-Scrape (Batch) ===\n");

  // Fetch eligible targets
  const allTargets = await prisma.$queryRaw`
    SELECT p."id", p."nameZh", p."institution", p."department", p."title",
           p."bioZh", p."email", p."nameEn", p."hIndex",
           p.metadata->>'sourceUrl' as url,
           p.metadata->>'universityKey' as uniKey
    FROM "Person" p
    WHERE p."isActive" = true
    AND p.metadata->>'sourceUrl' IS NOT NULL
    AND (p."bioZh" IS NULL OR LENGTH(p."bioZh") < 50)
    AND p."hIndex" IS NULL
    ORDER BY p."score" DESC
  ` as Array<{ id: string; nameZh: string; institution: string; department: string | null; title: string | null; bioZh: string | null; email: string | null; nameEn: string | null; hIndex: number | null; url: string; uniKey: string | null }>;

  console.log(`Total eligible targets: ${allTargets.length}`);
  const targets = allTargets.slice(0, BATCH_SIZE);
  console.log(`Processing ${targets.length} this run\n`);

  let updated = 0, noChange = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    // Determine university key
    const uniKey = t.uniKey || INST_KEY_MAP[t.institution] || 'tsinghua';

    try {
      const parsed = await fetchAndParseProfile(t.url, uniKey);

      if (!parsed || !parsed.nameZh) {
        failed++;
        if (failed <= 3) console.log(`  [FAIL] ${t.nameZh}: ${t.url.substring(0, 50)}`);
        continue;
      }

      // Track gains
      const gained: string[] = [];
      if (!t.bioZh && parsed.bio) gained.push(`bio(${parsed.bio.length}c)`);
      else if (t.bioZh && parsed.bio && parsed.bio.length > t.bioZh.length + 30) gained.push(`betterBio`);

      if (!t.department && parsed.department) gained.push(`dept=${parsed.department}`);
      if (!t.email && parsed.email) gained.push(`email`);
      if (!t.title && parsed.title) gained.push(`title=${parsed.title}`);
      if (!t.nameEn && parsed.nameEn) gained.push(`nameEn=${parsed.nameEn}`);

      if (gained.length > 0) {
        const updateData: Record<string, any> = { lastScrapedAt: new Date() };
        if (parsed.bio && (!t.bioZh || parsed.bio.length > (t.bioZh?.length || 0))) {
          updateData.bioZh = parsed.bio.slice(0, 2000);
        }
        if (parsed.department && !t.department) updateData.department = parsed.department;
        if (parsed.email && !t.email) updateData.email = parsed.email;
        if (parsed.title && !t.title) updateData.title = parsed.title;
        if (parsed.nameEn && !t.nameEn) updateData.nameEn = parsed.nameEn;

        await prisma.person.update({ where: { id: t.id }, data: updateData });
        updated++;
        console.log(`[${i+1}/${targets.length}] ${t.nameZh}: +${gained.join(', ')}`);
      } else {
        noChange++;
      }

      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    } catch (err) {
      failed++;
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Updated: ${updated} | No change: ${noChange} | Failed: ${failed}`);

  // Quick stats
  const [withBio, total] = await Promise.all([
    prisma.person.count({ where: { isActive: true, bioZh: { not: null } } }),
    prisma.person.count({ where: { isActive: true } }),
  ]);
  console.log(`Bio coverage: ${withBio}/${total} (${(withBio/total*100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main();

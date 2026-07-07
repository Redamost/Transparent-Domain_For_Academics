// Clean up junk scholars — navigation items mistakenly scraped as people
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== Junk Scholar Cleanup ===\n");

  const totalBefore = await prisma.person.count({ where: { isActive: true } });
  console.log(`Active scholars before: ${totalBefore}`);

  // Find ALL scholars whose names clearly aren't real Chinese person names.
  // Chinese person names: 2-4 characters, not containing navigation/department/event words.
  const JUNK_PATTERNS = [
    // Navigation & UI
    '首页', '导航', '登录', '注册', '链接', '栏目', '网站',
    // Administrative
    '公告', '通知', '公示', '采购', '招标', '规章',
    // Downloads / Resources
    '下载', '文档', '资料', '专区',
    // News / Events
    '新闻', '动态', '活动', '焦点', '专题', '合集',
    // Education (section names)
    '教育', '教学', '培养', '招生', '本科', '研究生', '留学生',
    // Party / Union
    '党建', '党群', '工会', '团学', '组织', '制度', '队伍',
    // Alumni
    '校友',
    // Recruitment
    '招聘', '人才', '师资',
    // Communication / Exchange
    '交流', '合作',
    // Email
    '邮箱',
  ];

  // Build a query to find names matching these patterns
  const likeClauses = JUNK_PATTERNS.map(p => `"nameZh" LIKE '%${p}%'`).join(' OR ');
  const junkQuery = `
    SELECT "id", "nameZh", "institution", "title"
    FROM "Person"
    WHERE "isActive" = true
    AND (${likeClauses})
    ORDER BY "nameZh"
  `;

  const results = await prisma.$queryRawUnsafe<Array<{ id: string; nameZh: string; institution: string; title: string }>>(junkQuery);
  console.log(`Found ${results.length} potential junk scholars`);

  // Manually filter: exclude names that could be real people
  // Chinese person names are typically 2-4 chars. Names with 4+ chars that contain nav words are likely junk.
  // But 2-3 char names containing nav words could go either way.
  const definitelyJunk: Array<{ id: string; nameZh: string; institution: string; title: string }> = [];

  for (const row of results) {
    const n = row.nameZh;
    const t = row.title || '';

    // Skip if: short name (2-3 chars) could be a real person
    // e.g. "郭新闻" (3 chars) - could be Guo Xinwen, a real person
    if (n.length <= 3) {
      // Only flag as junk if it's extremely obviously not a person name
      if (['登录', '邮箱', '首页', '导航', '下载', '链接', '注册'].includes(n)) {
        definitelyJunk.push(row);
      }
      // Skip ambiguous short names
      continue;
    }

    // For 4+ char names, check if the name is purely a navigation item
    // Real Chinese names are rarely 4+ chars unless compound surname + given name
    // Most 4+ char entries are navigation/organizational
    const isPureNav = (
      n.includes('首页') || n.includes('公告') || n.includes('通知') ||
      n.includes('新闻') || n.includes('动态') || n.includes('下载') ||
      n.includes('链接') || n.includes('导航') || n.includes('制度') ||
      n.includes('校友') || n.includes('教育') || n.includes('招聘') ||
      n.includes('采购') || n.includes('登录') || n.includes('注册') ||
      n.includes('邮箱') || n.includes('党建') || n.includes('党群') ||
      n.includes('工会') || n.includes('交流') || n.includes('合作') ||
      n.includes('组织') && n.length >= 4
    );

    if (isPureNav) {
      definitelyJunk.push(row);
    } else {
      console.log(`  [SKIP] "${n}" (${row.institution}) — might be real`);
    }
  }

  console.log(`\nDefinitely junk: ${definitelyJunk.length}`);

  // Show breakdown
  const grouped: Record<string, string[]> = {};
  for (const j of definitelyJunk) {
    if (!grouped[j.nameZh]) grouped[j.nameZh] = [];
    grouped[j.nameZh].push(j.institution || '?');
  }
  for (const [name, insts] of Object.entries(grouped).sort()) {
    console.log(`  ${name}: ${insts.join(', ')}`);
  }

  if (definitelyJunk.length > 0) {
    const ids = definitelyJunk.map(j => j.id);
    console.log(`\nDeactivating ${ids.length} more junk scholars...`);

    const result = await prisma.person.updateMany({
      where: { id: { in: ids } },
      data: {
        isActive: false,
        metadata: {
          source: 'CLEANUP',
          deactivatedReason: 'junk_name_pattern',
          deactivatedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`Deactivated: ${result.count}`);
  }

  const totalAfter = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nActive scholars after: ${totalAfter} (removed ${totalBefore - totalAfter})`);

  // Final check: any remaining suspicious names?
  const finalCheck = await prisma.$queryRaw`
    SELECT "nameZh", "institution"
    FROM "Person"
    WHERE "isActive" = true
    AND LENGTH("nameZh") > 4
    AND (
      "nameZh" LIKE '%首页%' OR "nameZh" LIKE '%公告%' OR "nameZh" LIKE '%通知%'
      OR "nameZh" LIKE '%新闻%' OR "nameZh" LIKE '%动态%' OR "nameZh" LIKE '%校友%'
      OR "nameZh" LIKE '%招聘%' OR "nameZh" LIKE '%党建%' OR "nameZh" LIKE '%邮箱%'
      OR "nameZh" LIKE '%链接%' OR "nameZh" LIKE '%下载%' OR "nameZh" LIKE '%登录%'
    )
  `;
  console.log(`Remaining suspicious long names: ${(finalCheck as any[]).length}`);
  if ((finalCheck as any[]).length > 0) console.table(finalCheck);

  await prisma.$disconnect();
  console.log("\nDone.");
}

main();

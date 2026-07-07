import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== Garbage Bio Cleanup ===\n");

  // Clear bios that are navigation menu text (not real scholar bios)
  const GARBAGE_BIO_PATTERNS = [
    '竞价公示', '学院概况 学院简介', '学院概况学院简介',
    '学院简介 学院介绍 组织机构', '导航痕迹',
    '党政领导', '行政办公 党建工会',
    '师资队伍 专任教师', '师资队伍 全体教师',
    '组织机构 历任领导', '历任领导 委员会',
    '本科生培养 教学通知', '研究生培养 研究生通知',
    '党建工作 党建动态', '党建动态 党建通知',
    '工会工作 工会建设', '人才工程 科学研究',
  ];

  let cleaned = 0;
  const batch = [];

  for (const pattern of GARBAGE_BIO_PATTERNS) {
    const result = await prisma.person.updateMany({
      where: {
        isActive: true,
        bioZh: { startsWith: pattern },
      },
      data: { bioZh: null },
    });
    if (result.count > 0) {
      console.log(`  Pattern "${pattern.substring(0, 40)}": cleaned ${result.count}`);
      cleaned += result.count;
    }
  }

  console.log(`\nTotal bios cleaned: ${cleaned}`);

  // Also check for other garbage patterns
  const remaining = await prisma.person.count({
    where: { isActive: true, bioZh: { not: null } },
  });
  console.log(`Remaining scholars with bios: ${remaining}`);

  await prisma.$disconnect();
}

main();

// Clean up scholars with obviously garbage names
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const GARBAGE_NAMES = [
  '包括', '长聘副', '客座', '助理', '特聘副', '副教授', '教授', '讲师',
  '研究员', '副研究员', '助教', '博士后', '访问学者', '兼职', '荣誉',
  '党政领导', '组织机构', '师资队伍', '杰出人才', '师资名单',
  '博士生导师', '硕士生导师', '教职工名录', '教师名录',
  '与工程所特聘', '北京大学讲席',
];

async function main() {
  for (const name of GARBAGE_NAMES) {
    const count = await prisma.person.count({
      where: { isActive: true, nameZh: name },
    });
    if (count > 0) {
      console.log(`Deleting ${count} scholars with name "${name}"...`);
      await prisma.person.updateMany({
        where: { isActive: true, nameZh: name },
        data: { isActive: false, metadata: { deactivated: true, reason: `garbage_name:${name}`, deactivatedAt: new Date().toISOString() } },
      });
    }
  }

  // Also clean up partial names (names containing known garbage prefixes)
  const partialGarbage = await prisma.person.findMany({
    where: {
      isActive: true,
      OR: [
        { nameZh: { startsWith: '机学院' } },
        { nameZh: { startsWith: '算机学院' } },
        { nameZh: { startsWith: '与工程所' } },
      ],
    },
    select: { id: true, nameZh: true },
  });

  console.log(`\nPartial garbage names:`);
  for (const p of partialGarbage) {
    console.log(`  ${p.nameZh}`);
    // Try to extract real name (after institution prefix)
    const cleaned = p.nameZh.replace(/^(?:机学院|算机学院|与工程所)/, '');
    if (cleaned.length >= 2 && cleaned.length <= 4) {
      await prisma.person.update({
        where: { id: p.id },
        data: { nameZh: cleaned },
      });
      console.log(`    → Fixed: "${cleaned}"`);
    }
  }

  const total = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nTotal scholars after cleanup: ${total}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

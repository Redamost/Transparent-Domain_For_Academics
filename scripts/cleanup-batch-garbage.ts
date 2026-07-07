// Clean up garbage names from batch Playwright scraping
import { prisma } from '../src/lib/prisma';

const GARBAGE_NAMES = [
  '主站', '登录', '网站首页', '单位列表', '教师索引', '不限',
  '按姓名', '按职称', '按院系', '全部', '教授', '副教授',
  '讲师', '研究员', '副研究员', '高级', '中级', '初级',
  '博士生', '硕士生', '本科生', '博士后', '首页', 'English',
  '旧版', '返回', '设为首页', '加入收藏', '后台管理',
  '管理登录', '教师登录', '学生登录', '院长信箱', '书记信箱',
  '办公电话', '传真', '电子邮箱', '通讯地址', '邮政编码',
];

async function main() {
  console.log('Cleaning up garbage names...\n');

  // 1. Delete/soft-delete garbage names
  for (const name of GARBAGE_NAMES) {
    const found = await prisma.person.findMany({
      where: { nameZh: name, isActive: true },
      select: { id: true, nameZh: true, institution: true },
    });
    if (found.length > 0) {
      for (const p of found) {
        await prisma.person.update({
          where: { id: p.id },
          data: { isActive: false, metadata: { deactivated: true, reason: 'GARBAGE_NAME_CLEANUP', originalName: name } },
        });
        console.log(`  Deactivated: "${p.nameZh}" @ ${p.institution}`);
      }
    }
  }

  // 2. Find single-char or non-CJK names
  const allActive = await prisma.person.findMany({
    where: { isActive: true },
    select: { id: true, nameZh: true, institution: true },
  });
  let deactivated = 0;
  for (const p of allActive) {
    if (p.nameZh.length < 2 || !/^[一-鿿]{2,4}$/.test(p.nameZh)) {
      await prisma.person.update({
        where: { id: p.id },
        data: { isActive: false, metadata: { deactivated: true, reason: 'INVALID_NAME_CLEANUP' } },
      });
      deactivated++;
      if (deactivated <= 20) console.log(`  Deactivated: "${p.nameZh}" (len=${p.nameZh.length}) @ ${p.institution}`);
    }
  }
  if (deactivated > 20) console.log(`  ... and ${deactivated - 20} more`);

  // 3. Check remaining scholars with "nav-like" names (long names, names with punctuation)
  const navLike = await prisma.person.findMany({
    where: {
      isActive: true,
      OR: [
        { nameZh: { contains: '·' } },
        { nameZh: { contains: '-' } },
        { nameZh: { contains: '•' } },
      ],
    },
    select: { id: true, nameZh: true, institution: true },
  });
  for (const p of navLike) {
    await prisma.person.update({
      where: { id: p.id },
      data: { isActive: false, metadata: { deactivated: true, reason: 'PUNCTUATED_NAME_CLEANUP' } },
    });
    console.log(`  Deactivated (punctuation): "${p.nameZh}" @ ${p.institution}`);
  }

  // Final count
  const remaining = await prisma.person.count({ where: { isActive: true } });
  console.log(`\nDone. Remaining active scholars: ${remaining}`);
  await prisma.$disconnect();
}
main();

import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.person.count({ where: { isActive: true } });
  console.log(`Total active scholars: ${total}`);

  const byInst = await prisma.person.groupBy({
    by: ['institution'],
    where: { isActive: true },
    _count: true,
    orderBy: { _count: { nameZh: 'desc' } },
  });
  console.log('\nBy institution:');
  for (const r of byInst) {
    console.log(`  ${r.institution}: ${r._count}`);
  }

  // Check C9 universities specifically
  const c9Institutions = [
    '清华大学', '北京大学', '复旦大学', '上海交通大学',
    '浙江大学', '中国科学技术大学', '南京大学', '哈尔滨工业大学', '西安交通大学'
  ];
  console.log('\nC9 League:');
  for (const inst of c9Institutions) {
    const count = await prisma.person.count({ where: { institution: inst, isActive: true } });
    console.log(`  ${inst}: ${count}`);
  }

  // Coverage stats
  const withEmail = await prisma.person.count({ where: { isActive: true, email: { not: null } } });
  const withDept = await prisma.person.count({ where: { isActive: true, department: { not: null } } });
  const withBio = await prisma.person.count({ where: { isActive: true, bioZh: { not: null } } });
  const withTitle = await prisma.person.count({ where: { isActive: true, title: { not: null } } });
  console.log(`\nCoverage: email=${withEmail}/${total} (${(withEmail/total*100).toFixed(1)}%) department=${withDept}/${total} (${(withDept/total*100).toFixed(1)}%) bio=${withBio}/${total} (${(withBio/total*100).toFixed(1)}%) title=${withTitle}/${total} (${(withTitle/total*100).toFixed(1)}%)`);

  // Fields coverage
  const withFields = await prisma.person.count({
    where: { isActive: true, fields: { some: {} } },
  });
  console.log(`Fields: ${withFields}/${total} (${(withFields/total*100).toFixed(1)}%)`);

  // Institutions with 0 data
  const allInst = await prisma.person.groupBy({ by: ['institution'], where: { isActive: true }, _count: true });
  const instNames = allInst.map(r => r.institution);
  console.log(`\nTotal institutions with data: ${allInst.length}`);

  // 985 universities with 0 data
  const all985 = [
    '清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学',
    '中国科学技术大学', '南京大学', '哈尔滨工业大学', '西安交通大学',
    '武汉大学', '中山大学', '华中科技大学', '同济大学', '北京航空航天大学',
    '四川大学', '东南大学', '中国人民大学', '南开大学', '天津大学',
    '北京理工大学', '大连理工大学', '吉林大学', '山东大学', '厦门大学',
    '兰州大学', '西北工业大学', '华南理工大学', '中南大学', '湖南大学',
    '东北大学', '重庆大学', '华东师范大学', '北京师范大学', '电子科技大学',
    '中国农业大学', '国防科技大学', '西北农林科技大学', '中央民族大学', '中国海洋大学'
  ];
  const zero985 = all985.filter(n => !instNames.includes(n));
  console.log(`985 with 0 data: ${zero985.length} — ${zero985.join(', ')}`);

  await prisma.$disconnect();
}
main();

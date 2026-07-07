// Comprehensive final report for this session
import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.person.count({ where: { isActive: true } });
  console.log('═══════════════════════════════════════════');
  console.log('  985高校学者数据库 — 阶段性报告');
  console.log('═══════════════════════════════════════════\n');

  // Core metrics
  console.log('【核心指标】');
  console.log(`  活跃学者总数: ${total}`);
  console.log(`  覆盖高校数:   32/39 (82.1%)`);

  const prevTotal = 1549;
  console.log(`  本次新增:     +${total - prevTotal} (${prevTotal} → ${total})`);

  // By institution, grouped
  const byInst = await prisma.person.groupBy({
    by: ['institution'],
    where: { isActive: true },
    _count: true,
    orderBy: { _count: { nameZh: 'desc' } },
  });

  // Group by tier
  const massive = byInst.filter(r => r._count >= 100); // 100+
  const large = byInst.filter(r => r._count >= 50 && r._count < 100);
  const medium = byInst.filter(r => r._count >= 20 && r._count < 50);
  const small = byInst.filter(r => r._count >= 5 && r._count < 20);
  const tiny = byInst.filter(r => r._count < 5);

  console.log(`\n【高校分层】`);
  console.log(`  🏆 ≥100人 (${massive.length}所):`);
  for (const r of massive) console.log(`     ${r.institution}: ${r._count}`);
  console.log(`  🥇 50-99人 (${large.length}所):`);
  for (const r of large) console.log(`     ${r.institution}: ${r._count}`);
  console.log(`  🥈 20-49人 (${medium.length}所):`);
  for (const r of medium) console.log(`     ${r.institution}: ${r._count}`);
  console.log(`  🥉 5-19人 (${small.length}所):`);
  for (const r of small) console.log(`     ${r.institution}: ${r._count}`);
  console.log(`  🔸 1-4人 (${tiny.length}所):`);
  for (const r of tiny) console.log(`     ${r.institution}: ${r._count}`);

  // C9
  const c9Order = ['清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学',
    '中国科学技术大学', '南京大学', '哈尔滨工业大学', '西安交通大学'];
  const instMap = new Map(byInst.map(r => [r.institution, r._count]));
  console.log(`\n【C9联盟】`);
  for (const inst of c9Order) {
    const count = instMap.get(inst) || 0;
    const bar = '█'.repeat(Math.min(count / 5, 20));
    console.log(`  ${inst}: ${count} ${bar}`);
  }

  // 985 still missing
  const all985 = new Set([
    '清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学',
    '中国科学技术大学', '南京大学', '哈尔滨工业大学', '西安交通大学',
    '武汉大学', '中山大学', '华中科技大学', '同济大学', '北京航空航天大学',
    '四川大学', '东南大学', '中国人民大学', '南开大学', '天津大学',
    '北京理工大学', '大连理工大学', '吉林大学', '山东大学', '厦门大学',
    '兰州大学', '西北工业大学', '华南理工大学', '中南大学', '湖南大学',
    '东北大学', '重庆大学', '华东师范大学', '北京师范大学', '电子科技大学',
    '中国农业大学', '国防科技大学', '西北农林科技大学', '中央民族大学', '中国海洋大学'
  ]);
  const withData = new Set(byInst.map(r => r.institution));
  const withoutData = [...all985].filter(n => !withData.has(n));
  console.log(`\n【未覆盖985】(共${withoutData.length}所):`);
  console.log(`  ${withoutData.join(', ')}`);

  // Coverage
  const withEmail = await prisma.person.count({ where: { isActive: true, email: { not: null } } });
  const withDept = await prisma.person.count({ where: { isActive: true, department: { not: null } } });
  const withBio = await prisma.person.count({ where: { isActive: true, bioZh: { not: null } } });
  const withTitle = await prisma.person.count({ where: { isActive: true, title: { not: null } } });
  const withFields = await prisma.person.count({ where: { isActive: true, fields: { some: {} } } });

  console.log(`\n【数据质量】`);
  console.log(`  研究领域: ${withFields}/${total} (${(withFields/total*100).toFixed(1)}%)`);
  console.log(`  邮箱:     ${withEmail}/${total} (${(withEmail/total*100).toFixed(1)}%)`);
  console.log(`  院系:     ${withDept}/${total} (${(withDept/total*100).toFixed(1)}%)`);
  console.log(`  职称:     ${withTitle}/${total} (${(withTitle/total*100).toFixed(1)}%)`);
  console.log(`  个人简介: ${withBio}/${total} (${(withBio/total*100).toFixed(1)}%)`);

  // Top fields
  console.log(`\n【热门研究领域 TOP 10】`);
  const topFields = await prisma.field.findMany({
    where: { persons: { some: { person: { isActive: true } } } },
    orderBy: { persons: { _count: 'desc' } },
    take: 10,
    select: { nameZh: true, slug: true, _count: { select: { persons: true } } },
  });
  for (const f of topFields) {
    console.log(`  ${f.nameZh} (${f.slug}): ${f._count.persons}人`);
  }

  // New institutions this session
  console.log(`\n【本次新增高校 TOP 10】`);
  const newInstitutions = [
    { name: '西北工业大学', prev: 0, now: instMap.get('西北工业大学') || 0 },
    { name: '北京航空航天大学', prev: 0, now: instMap.get('北京航空航天大学') || 0 },
    { name: '中南大学', prev: 0, now: instMap.get('中南大学') || 0 },
    { name: '中央民族大学', prev: 0, now: instMap.get('中央民族大学') || 0 },
    { name: '中国农业大学', prev: 0, now: instMap.get('中国农业大学') || 0 },
    { name: '厦门大学', prev: 0, now: instMap.get('厦门大学') || 0 },
    { name: '中国人民大学', prev: 0, now: instMap.get('中国人民大学') || 0 },
    { name: '南开大学', prev: 0, now: instMap.get('南开大学') || 0 },
    { name: '西北农林科技大学', prev: 0, now: instMap.get('西北农林科技大学') || 0 },
    { name: '电子科技大学', prev: 0, now: instMap.get('电子科技大学') || 0 },
    { name: '大连理工大学', prev: 0, now: instMap.get('大连理工大学') || 0 },
    { name: '山东大学', prev: 0, now: instMap.get('山东大学') || 0 },
    { name: '重庆大学', prev: 0, now: instMap.get('重庆大学') || 0 },
    { name: '天津大学', prev: 0, now: instMap.get('天津大学') || 0 },
    { name: '华东师范大学', prev: 0, now: instMap.get('华东师范大学') || 0 },
    { name: '东北大学', prev: 0, now: instMap.get('东北大学') || 0 },
    { name: '东南大学', prev: 0, now: instMap.get('东南大学') || 0 },
    { name: '中国海洋大学', prev: 0, now: instMap.get('中国海洋大学') || 0 },
  ];
  for (const inst of newInstitutions.sort((a, b) => b.now - a.now)) {
    console.log(`  ${inst.name}: ${inst.prev} → ${inst.now} (+${inst.now - inst.prev})`);
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  报告生成时间: ${new Date().toISOString()}`);
  console.log(`═══════════════════════════════════════════`);

  await prisma.$disconnect();
}
main();

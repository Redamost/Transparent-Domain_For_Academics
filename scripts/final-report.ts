// Final comprehensive database report
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  985高校学者数据库 — 最终报告');
  console.log('═══════════════════════════════════════════════\n');

  const total = await prisma.person.count({ where: { isActive: true } });

  // ─── Per Institution ───
  const byInst = await prisma.person.groupBy({
    by: ['institution'],
    where: { isActive: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('📊 各高校学者分布:');
  console.log('─'.repeat(45));
  let total985 = 0;
  const fivePlus = byInst.filter(g => g._count.id >= 5);
  const seedOnly = byInst.filter(g => g._count.id < 5 && g._count.id >= 1);
  for (const g of fivePlus) {
    const bar = '█'.repeat(Math.max(1, Math.round(g._count.id / 20)));
    console.log(`  ${(g.institution||'N/A').padEnd(16)} ${String(g._count.id).padStart(4)} ${bar}`);
    total985 += g._count.id;
  }
  if (seedOnly.length > 0) {
    console.log(`  ─── 仅种子数据 (${seedOnly.length}所) ───`);
    for (const g of seedOnly) {
      console.log(`  ${(g.institution||'N/A').padEnd(16)} ${String(g._count.id).padStart(4)} (种子)`);
    }
  }

  // ─── Quality Metrics ───
  const withBio = await prisma.person.count({ where: { isActive: true, bioZh: { not: null } } });
  const withEmail = await prisma.person.count({ where: { isActive: true, email: { not: null } } });
  const withDept = await prisma.person.count({ where: { isActive: true, department: { not: null } } });
  const withFields = await prisma.person.count({ where: { isActive: true, fields: { some: {} } } });
  const withHIndex = await prisma.person.count({ where: { isActive: true, hIndex: { not: null } } });
  const withPubs = await prisma.person.count({ where: { isActive: true, publications: { some: {} } } });

  console.log(`\n📈 数据质量: (共${total}位学者)`);
  console.log('─'.repeat(45));
  const metrics = [
    ['院系 Department', withDept],
    ['研究领域 Fields', withFields],
    ['邮箱 Email', withEmail],
    ['个人简介 Bio', withBio],
    ['论文 Publications', withPubs],
    ['hIndex', withHIndex],
  ];
  for (const [label, count] of metrics) {
    const pct = (Number(count)/total*100).toFixed(1);
    const bar = '█'.repeat(Math.round(Number(pct)/5));
    console.log(`  ${String(label).padEnd(20)} ${String(count).padStart(4)}/${total} (${pct}%) ${bar}`);
  }

  // ─── Field Distribution ───
  const fieldDist = await prisma.personField.groupBy({
    by: ['fieldId'],
    _count: { personId: true },
    orderBy: { _count: { personId: 'desc' } },
    take: 15,
  });

  console.log(`\n🏷️  研究领域分布 (Top 15):`);
  console.log('─'.repeat(45));
  for (const f of fieldDist) {
    const field = await prisma.field.findUnique({ where: { id: f.fieldId }, select: { nameZh: true } });
    console.log(`  ${(field?.nameZh||f.fieldId).padEnd(24)} ${String(f._count.personId).padStart(4)}`);
  }

  // ─── University Scraping Status ───
  const { UNIVERSITY_CONFIGS } = await import('../src/lib/scraping/cn-university');
  const configuredCount = UNIVERSITY_CONFIGS.length;
  const withData = new Set(byInst.map(g => g.institution));

  let withMoreThan10 = 0, withSomeData = 0, withNoData = 0;
  for (const uni of UNIVERSITY_CONFIGS) {
    const inst = byInst.find(g => g.institution === uni.nameZh);
    const count = inst?._count.id || 0;
    if (count >= 10) withMoreThan10++;
    else if (count >= 1) withSomeData++;
    else withNoData++;
  }

  console.log(`\n🏫 985高校爬取状态: (配置${configuredCount}所)`);
  console.log('─'.repeat(45));
  console.log(`  ✅ ≥10位学者:   ${withMoreThan10}所`);
  console.log(`  ⚠️  1-9位(种子): ${withSomeData}所`);
  console.log(`  ❌ 0位学者:     ${withNoData}所`);

  // ─── Source breakdown ───
  const [seedCount, cnUniCount] = await Promise.all([
    prisma.person.count({ where: { isActive: true, metadata: { path: ['source'], equals: 'seed' } } }),
    prisma.person.count({ where: { isActive: true, metadata: { path: ['source'], equals: 'CN_UNIVERSITY' } } }),
  ]);
  const otherCount = total - seedCount - cnUniCount;
  console.log(`\n📥 数据来源:`);
  console.log(`  seed: ${seedCount}`);
  console.log(`  CN_UNIVERSITY: ${cnUniCount}`);
  if (otherCount > 0) console.log(`  OTHER: ${otherCount}`);

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  ✅ 报告生成完毕`);
  console.log(`═══════════════════════════════════════════════`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

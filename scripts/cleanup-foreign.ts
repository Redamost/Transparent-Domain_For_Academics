// ─── Cleanup Foreign (non-Chinese) Researchers ───
// Removes researchers who don't belong to Chinese institutions.
// Safety: never deletes seed data, ORCID-verified researchers,
// or anyone with a .edu.cn email.
//
// Usage:
//   npx tsx scripts/cleanup-foreign.ts --dry-run   # Preview only
//   npx tsx scripts/cleanup-foreign.ts              # Execute deletion

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/transparent_domain?schema=public',
});
const prisma = new PrismaClient({ adapter });

// ─── Chinese Institution Indicators ───

const CHINESE_UNIVERSITY_NAMES = [
  // C9 League
  '清华大学', 'Tsinghua University',
  '北京大学', 'Peking University',
  '浙江大学', 'Zhejiang University',
  '复旦大学', 'Fudan University',
  '上海交通大学', 'Shanghai Jiao Tong University', 'Shanghai Jiaotong University',
  '中国科学技术大学', 'University of Science and Technology of China', 'USTC',
  '南京大学', 'Nanjing University',
  '哈尔滨工业大学', 'Harbin Institute of Technology', 'HIT',
  '西安交通大学', "Xi'an Jiaotong University", 'Xi an Jiaotong University',

  // Other top 985
  '武汉大学', 'Wuhan University',
  '中山大学', 'Sun Yat-sen University', 'Sun Yat Sen University',
  '华中科技大学', 'Huazhong University of Science and Technology', 'HUST',
  '同济大学', 'Tongji University',
  '北京航空航天大学', 'Beihang University', 'BUAA',
  '四川大学', 'Sichuan University',
  '东南大学', 'Southeast University',
  '中国人民大学', 'Renmin University of China',
  '南开大学', 'Nankai University',
  '天津大学', 'Tianjin University',
  '北京师范大学', 'Beijing Normal University',
  '厦门大学', 'Xiamen University',
  '吉林大学', 'Jilin University',
  '华东师范大学', 'East China Normal University', 'ECNU',
  '中南大学', 'Central South University',
  '中国科学院', 'Chinese Academy of Sciences', 'CAS',
  '中国工程院', 'Chinese Academy of Engineering',
  '国防科技大学', 'National University of Defense Technology',

  // Additional Chinese university domains / patterns
  '深圳大学', 'Shenzhen University',
  '南方科技大学', 'Southern University of Science and Technology', 'SUSTech',
  '北京理工大学', 'Beijing Institute of Technology',
  '华南理工大学', 'South China University of Technology',
  '大连理工大学', 'Dalian University of Technology',
  '西北工业大学', 'Northwestern Polytechnical University',
  '电子科技大学', 'University of Electronic Science and Technology of China', 'UESTC',
  '湖南大学', 'Hunan University',
  '重庆大学', 'Chongqing University',
  '兰州大学', 'Lanzhou University',
  '中国农业大学', 'China Agricultural University',
  '北京科技大学', 'University of Science and Technology Beijing',
  '北京邮电大学', 'Beijing University of Posts and Telecommunications',
  '上海大学', 'Shanghai University',
  '苏州大学', 'Soochow University',
  '西安电子科技大学', 'Xidian University',
];

// Chinese character range
function hasChinese(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[一-鿿㐀-䶿]/.test(text);
}

// Check .edu.cn email
function hasEduCn(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().includes('.edu.cn');
}

// Check institution matches known Chinese university
function matchesChineseUniversity(institution: string | null | undefined): boolean {
  if (!institution) return false;
  const lower = institution.toLowerCase().trim();
  for (const name of CHINESE_UNIVERSITY_NAMES) {
    if (institution.includes(name) || lower.includes(name.toLowerCase())) {
      return true;
    }
  }
  // Also check for .edu.cn domains in institution name
  if (lower.includes('.edu.cn')) return true;
  return false;
}

// ─── Classification ───

type Classification = 'definitely-chinese' | 'probably-chinese' | 'foreign' | 'junk';

function classify(person: {
  nameEn: string | null;
  nameZh: string;
  institution: string | null;
  email: string | null;
  metadata: any;
  orcidId: string | null;
}): { classification: Classification; reason: string } {
  // 1. Seed data — always keep
  if (person.metadata?.seeded === true) {
    return { classification: 'definitely-chinese', reason: '种子数据' };
  }

  // 2. Has .edu.cn email — definitely Chinese institution
  if (hasEduCn(person.email)) {
    return { classification: 'definitely-chinese', reason: `邮箱 .edu.cn: ${person.email}` };
  }

  // 3. Institution contains Chinese characters — definitely Chinese
  if (hasChinese(person.institution)) {
    return { classification: 'definitely-chinese', reason: `机构含中文: ${person.institution}` };
  }

  // 4. Name contains Chinese characters — strong indicator (Chinese scholar abroad or at home)
  if (hasChinese(person.nameZh)) {
    // If name is Chinese but institution doesn't match, still likely Chinese researcher
    // (could be at an international institution not in our list, or institution field is null)
    if (person.orcidId) {
      return { classification: 'probably-chinese', reason: `中文名+ORCID: ${person.nameZh}` };
    }
    if (person.institution && matchesChineseUniversity(person.institution)) {
      return { classification: 'definitely-chinese', reason: `中文名+中国机构: ${person.institution}` };
    }
    // Chinese name with no ORCID and unknown institution — still probably Chinese
    return { classification: 'probably-chinese', reason: `中文名无ORCID: ${person.nameZh}` };
  }

  // 5. Institution matches known Chinese university
  if (matchesChineseUniversity(person.institution)) {
    return { classification: 'definitely-chinese', reason: `中国机构: ${person.institution}` };
  }

  // 6. Has ORCID — keep as safety (could be Chinese researcher with English-only profile)
  if (person.orcidId) {
    return { classification: 'probably-chinese', reason: `有ORCID: ${person.orcidId}` };
  }

  // 7. Junk name patterns (from _cleanup-junk.ts experience)
  const name = person.nameEn || person.nameZh;
  if (/^(Science|Physics|Medicine|Biology|Economics|Chemistry|Mathematics)$/i.test(name)) {
    return { classification: 'junk', reason: `通用学科名: ${name}` };
  }
  if (/^[A-Z]\.\s*(Science|Physics|Medicine|Biology|Economics)$/i.test(name)) {
    return { classification: 'junk', reason: `缩写学科名: ${name}` };
  }
  if (/^Journal of /i.test(name) || /^Papers in /i.test(name) || /^Advances in /i.test(name)) {
    return { classification: 'junk', reason: `期刊名: ${name}` };
  }
  if (/^[A-Z]\.\s*M\.(Tech|Sc|Phil)/i.test(name) || /^[A-Z]\.\s*Dept\.?$/i.test(name)) {
    return { classification: 'junk', reason: `学位/部门名: ${name}` };
  }

  // 8. No Chinese indicators at all — foreign
  return { classification: 'foreign', reason: `无中文标识, 机构: ${person.institution || '(无)'}` };
}

// ─── Main ───

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) {
    console.log('=== DRY RUN MODE — 仅预览，不实际删除 ===\n');
  } else {
    console.log('=== 正式运行 — 将删除外籍研究者 ===\n');
  }

  // Fetch all active persons
  const allPersons = await prisma.person.findMany({
    where: { isActive: true },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      email: true,
      orcidId: true,
      metadata: true,
      _count: { select: { publications: true, researchUpdates: true } },
    },
  });

  console.log(`数据库活跃研究者总数: ${allPersons.length}\n`);

  const toDelete: Array<{
    id: string;
    nameZh: string;
    nameEn: string | null;
    institution: string | null;
    email: string | null;
    orcidId: string | null;
    reason: string;
    pubCount: number;
    updateCount: number;
  }> = [];

  const toKeep: string[] = [];
  const counts: Record<Classification, number> = {
    'definitely-chinese': 0,
    'probably-chinese': 0,
    'foreign': 0,
    'junk': 0,
  };

  for (const p of allPersons) {
    const { classification, reason } = classify({
      nameEn: p.nameEn,
      nameZh: p.nameZh,
      institution: p.institution,
      email: p.email,
      metadata: p.metadata as any,
      orcidId: p.orcidId,
    });

    counts[classification]++;

    if (classification === 'foreign' || classification === 'junk') {
      toDelete.push({
        id: p.id,
        nameZh: p.nameZh,
        nameEn: p.nameEn,
        institution: p.institution,
        email: p.email,
        orcidId: p.orcidId,
        reason,
        pubCount: p._count.publications,
        updateCount: p._count.researchUpdates,
      });
    } else {
      toKeep.push(p.id);
    }
  }

  // ─── Print Summary ───
  console.log('=== 分类统计 ===');
  console.log(`  确定中国学者:  ${counts['definitely-chinese']}`);
  console.log(`  疑似中国学者:  ${counts['probably-chinese']}  (安全保留)`);
  console.log(`  外籍研究者:    ${counts['foreign']}  → 待删除`);
  console.log(`  垃圾数据:      ${counts['junk']}  → 待删除`);
  console.log(`  保留总计:      ${toKeep.length}`);
  console.log(`  删除总计:      ${toDelete.length}\n`);

  if (toDelete.length === 0) {
    console.log('没有需要删除的记录。');
    await prisma.$disconnect();
    return;
  }

  // Print deletion list
  console.log('=== 待删除列表 ===');
  for (const p of toDelete) {
    const displayName = p.nameZh || p.nameEn || '(无名)';
    console.log(`  [${p.reason}] ${displayName}`);
    console.log(`    ID: ${p.id} | 机构: ${p.institution || '-'} | 邮箱: ${p.email || '-'}`);
    console.log(`    出版物: ${p.pubCount} | 动态: ${p.updateCount} | ORCID: ${p.orcidId || '-'}`);
  }

  if (isDryRun) {
    console.log(`\n=== DRY RUN 完成 ===`);
    console.log(`将删除 ${toDelete.length} 条记录。去掉 --dry-run 参数以实际执行。`);
    await prisma.$disconnect();
    return;
  }

  // ─── Execute Deletion ───
  console.log(`\n开始删除 ${toDelete.length} 条记录...\n`);

  let deleted = 0;
  let failed = 0;

  for (const p of toDelete) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.researchUpdate.deleteMany({ where: { personId: p.id } });
        await tx.publication.deleteMany({ where: { personId: p.id } });
        await tx.personField.deleteMany({ where: { personId: p.id } });
        await tx.scoreBreakdown.deleteMany({ where: { personId: p.id } });
        await tx.ratingLog.deleteMany({ where: { personId: p.id } });
        await tx.person.delete({ where: { id: p.id } });
      });
      console.log(`  ✓ 已删除: ${p.nameZh || p.nameEn} (${p.id})`);
      deleted++;
    } catch (e: any) {
      console.error(`  ✗ 删除失败 ${p.id}: ${e.message}`);
      failed++;
    }
  }

  // Final count
  const remaining = await prisma.person.count({ where: { isActive: true } });
  console.log(`\n=== 清理完成 ===`);
  console.log(`  成功删除: ${deleted}`);
  console.log(`  失败: ${failed}`);
  console.log(`  剩余活跃研究者: ${remaining}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('脚本执行失败:', e);
  process.exit(1);
});

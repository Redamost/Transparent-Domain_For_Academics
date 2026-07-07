/**
 * Cleans up garbage competition and evaluation records.
 *
 * The current extraction labels large blocks of bio text as competition/evaluation
 * data. This script deletes records that are clearly not competition/awards.
 *
 * Garbage patterns:
 * - Titles > 150 chars (likely bio text, not a competition name)
 * - Titles containing navigation/bio keywords: 教育经历, 工作经历, 联系方式, etc.
 * - Records with no level AND no award AND no result (empty data)
 *
 * Usage:
 *   npx tsx scripts/cleanup-garbage-compeval.ts [--dry-run]
 */

import { config } from 'dotenv';
config();

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DRY_RUN = process.argv.includes('--dry-run');

// Keywords that indicate bio/navigation text, NOT competition/evaluation data
const BIO_KEYWORDS = [
  '教育经历', '工作经历', '联系方式', '办公地点', '电子邮箱',
  '讲授课程', '教授课程', '教学情况', '科研项目', '发表论文',
  '研究方向', '研究领域', '个人简介', '教师简介', '学术兼职',
  '社会兼职', '招生信息', '负责', '主讲教师', '指导教师',
  '学习经历', '博士后', '博士', '硕士', '学士',
  'CS易办', '实验平台', '会议室', '办事大厅', '快速通道',
];

// Garbage patterns for competition updates
const COMP_GARBAGE_PATTERNS = [
  /^负责人\s/,         // Starts with "负责人" (person in charge, not competition)
  /讲授课程/,           // Teaching courses
  /教育经历/,           // Education history
  /^\d{4}年.*\d{4}年/, // Date ranges like "2024.09至今" (career timeline, not competition)
  /^\d{4}\.\d{2}/,     // Date format
  /^工作经验/,          // Work experience
  /^教授课程/,          // Courses taught
];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const p = new PrismaClient({ adapter });

  // Find garbage competition records
  const allComp = await p.competitionUpdate.findMany({
    select: { id: true, title: true, level: true, award: true, source: true },
  });

  const garbageCompIds: string[] = [];
  for (const c of allComp) {
    const reasons: string[] = [];

    // Too long = probably bio text
    if (c.title.length > 150) {
      reasons.push(`length=${c.title.length}`);
    }

    // Contains bio keywords
    const hasBioKeyword = BIO_KEYWORDS.some(kw => c.title.includes(kw));
    if (hasBioKeyword) {
      const found = BIO_KEYWORDS.filter(kw => c.title.includes(kw));
      reasons.push(`bio_kw:${found.join(',')}`);
    }

    // Matches garbage patterns
    const hasGarbagePattern = COMP_GARBAGE_PATTERNS.some(p => p.test(c.title));
    if (hasGarbagePattern) {
      reasons.push('garbage_pattern');
    }

    // Empty level AND empty award = no useful data
    if (!c.level && !c.award) {
      reasons.push('no_level_or_award');
    }

    if (reasons.length >= 2) { // At least 2 reasons to be confident it's garbage
      garbageCompIds.push(c.id);
      if (garbageCompIds.length <= 10) {
        console.log(`[COMP] ${c.title.slice(0, 80)}...`);
        console.log(`       Reasons: ${reasons.join(' | ')}`);
      }
    }
  }

  // Find garbage evaluation records
  const allEval = await p.evaluationUpdate.findMany({
    select: { id: true, title: true, evalType: true, result: true, source: true },
  });

  const garbageEvalIds: string[] = [];
  for (const e of allEval) {
    const reasons: string[] = [];

    if (e.title.length > 150) {
      reasons.push(`length=${e.title.length}`);
    }

    const hasBioKeyword = BIO_KEYWORDS.some(kw => e.title.includes(kw));
    if (hasBioKeyword) {
      reasons.push('bio_kw');
    }

    // Starts with "况：" (fragment of "获奖情况" etc.)
    if (/^况[：:]/.test(e.title)) {
      reasons.push('starts_with_fragment');
    }

    // Empty type AND empty result = no useful data
    if (!e.evalType && !e.result) {
      reasons.push('no_type_or_result');
    }

    if (reasons.length >= 2) {
      garbageEvalIds.push(e.id);
      if (garbageEvalIds.length <= 10) {
        console.log(`[EVAL] ${e.title.slice(0, 80)}...`);
        console.log(`       Reasons: ${reasons.join(' | ')}`);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total competition records: ${allComp.length}`);
  console.log(`Garbage competition (to delete): ${garbageCompIds.length}`);
  console.log(`Total evaluation records: ${allEval.length}`);
  console.log(`Garbage evaluation (to delete): ${garbageEvalIds.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Remove --dry-run to execute.');
  } else {
    if (garbageCompIds.length > 0) {
      await p.competitionUpdate.deleteMany({
        where: { id: { in: garbageCompIds } },
      });
      console.log(`\nDeleted ${garbageCompIds.length} garbage competition records.`);
    }

    if (garbageEvalIds.length > 0) {
      await p.evaluationUpdate.deleteMany({
        where: { id: { in: garbageEvalIds } },
      });
      console.log(`Deleted ${garbageEvalIds.length} garbage evaluation records.`);
    }

    console.log('\nCleanup complete.');
  }

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

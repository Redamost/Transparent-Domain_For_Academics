// ─── Database Cleanup Script ───
// Deletes all scraped garbage and foreign seed data, keeping only
// properly seeded Chinese scholars.
// Run: npx tsx scripts/cleanup-db.ts

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: ['error', 'warn'],
});

// Valid Chinese scholar seed IDs from seed.ts
const VALID_SEED_IDS = new Set([
  'seed-zhang-wei-001',    // 张伟 - 清华大学
  'seed-li-na-001',        // 李娜 - 北京大学
  'seed-wang-qiang-001',   // 王强 - 中科大
  'seed-chen-xue-001',     // 陈雪 - 复旦大学
  'seed-liu-yang-001',     // 刘洋 - 浙江大学
  'seed-zhao-mingming-001',// 赵明明 - 中科院
  'seed-huang-wen-001',    // 黄文 - 上海交大
  'seed-zhou-jie-001',     // 周洁 - 复旦大学
  'seed-wu-xia-001',       // 吴霞 - 中科大
  'seed-sun-lei-001',      // 孙磊 - 中科院
  'seed-ma-xin-001',       // 马欣 - 北京大学
  'seed-lin-fang-001',     // 林芳 - 上海交大
  'seed-guo-wei-001',      // 郭伟 - 哈工大
  'seed-yang-rui-001',     // 杨锐 - 南京大学
  'seed-tang-li-001',      // 唐莉 - 北京大学
  'seed-he-peng-001',      // 何鹏 - 浙江大学
  'seed-xu-jing-001',      // 徐静 - 中山大学
  'seed-shen-wei-001',     // 沈伟 - 武汉大学
  'seed-han-mei-001',      // 韩梅 - 北京大学
  'seed-cai-jun-001',      // 蔡军 - 浙江大学
  'seed-pan-yue-001',      // 潘越 - 中科大
  'seed-feng-kun-001',     // 冯坤 - 复旦大学
  'seed-jiang-hao-001',    // 姜浩 - 南京大学
  'seed-ren-yan-001',      // 任言 - 哈工大
  'seed-li-jing-001',      // 李静 - 南京大学
  'seed-zheng-tao-001',    // 郑涛 - 武汉大学
  'seed-xia-wei-001',      // 夏微 - 武汉大学
  'seed-luo-ming-001',     // 罗明 - 中山大学
]);

async function main() {
  console.log('🧹 Cleaning database...\n');

  // Count before
  const before = await prisma.person.count();
  console.log(`  Before: ${before} total persons`);

  // Count garbage
  const seedCount = await prisma.person.count({
    where: { id: { startsWith: 'seed-' } },
  });
  const garbageCount = before - seedCount;
  console.log(`  Seed: ${seedCount}, Garbage: ${garbageCount}\n`);

  // Delete non-seed persons (cascades to all relations)
  const deletedGarbage = await prisma.person.deleteMany({
    where: {
      NOT: { id: { startsWith: 'seed-' } },
    },
  });
  console.log(`  ✓ Deleted ${deletedGarbage.count} non-seed garbage records`);

  // Delete old foreign seed scholars (if still present)
  const foreignSeedIds = [
    'seed-douglas-m-001',
    'seed-sarah-c-001',
    'seed-romain-d-001',
    'seed-tanaka-h-001',
  ];
  for (const fid of foreignSeedIds) {
    if (!VALID_SEED_IDS.has(fid)) {
      try {
        await prisma.person.delete({ where: { id: fid } });
        console.log(`  ✓ Deleted foreign seed: ${fid}`);
      } catch {
        // Already deleted or doesn't exist — fine
      }
    }
  }

  // Delete any seed records that are NOT in our valid list
  const existingSeedIds = await prisma.person.findMany({
    where: { id: { startsWith: 'seed-' } },
    select: { id: true, nameZh: true },
  });
  for (const { id, nameZh } of existingSeedIds) {
    if (!VALID_SEED_IDS.has(id)) {
      await prisma.person.delete({ where: { id } });
      console.log(`  ✓ Deleted unknown seed record: ${id} (${nameZh})`);
    }
  }

  // After
  const after = await prisma.person.count();
  console.log(`\n  After: ${after} persons remain`);
  console.log('✅ Cleanup complete!\n');
}

main()
  .catch((e) => {
    console.error('Cleanup error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

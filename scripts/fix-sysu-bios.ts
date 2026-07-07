// ─── Clean up navigation-text bios ───
// Some SYSU pages produce bio containing sidebar nav text:
// "学院概况 学院简介 历史沿革 学院领导..."
//
// Usage: npx tsx scripts/fix-sysu-bios.ts [--dry-run]

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

// Patterns that indicate navigation menu text, not a real bio
const NAV_PATTERNS = [
  /^学院概况\s*学院简介/,
  /^学院概况\s*历史沿革/,
  /首页\s*学院概况/,
  /首页\s*旧版/,
  /^作\s*学术活动\s*学生工作/, // Second half of SYSU nav
  /^学术活动\s*学生工作/,
  /^\s*学术活动\s*学生工作/,
  /招生信息\s*本科生招生/,
];

async function main() {
  console.log(`[FixSYSU] Finding bad bios${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // Find all persons with navigation-like bios
  const all = await prisma.person.findMany({
    where: {
      isActive: true,
      bioZh: { not: null },
      institution: '中山大学',
    },
    select: { id: true, nameZh: true, bioZh: true, website: true },
  });

  let badCount = 0;
  let clearedCount = 0;
  const toReFetch: Array<{id: string; name: string; url: string}> = [];

  for (const p of all) {
    if (!p.bioZh) continue;
    const bioZh = p.bioZh;
    const isNav = NAV_PATTERNS.some(pat => pat.test(bioZh));
    if (isNav) {
      badCount++;
      console.log(`  BAD: ${p.nameZh} — "${p.bioZh.slice(0, 80)}..."`);

      if (!DRY_RUN) {
        // Navigation text — just clear it. Better null than garbage.
        await prisma.person.update({
          where: { id: p.id },
          data: { bioZh: null },
        });
        if (p.website) {
          toReFetch.push({ id: p.id, name: p.nameZh, url: p.website });
        }
        clearedCount++;
        console.log(`    → Cleared nav text`);
      }
    }
  }

  console.log(`\n[FixSYSU] Found ${badCount} bad bios${DRY_RUN ? ' (DRY RUN)' : ''}`);
  if (!DRY_RUN) {
    console.log(`[FixSYSU] Cleared/cleaned: ${clearedCount}`);
    console.log(`[FixSYSU] Need re-fetch: ${toReFetch.length}`);
  }

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

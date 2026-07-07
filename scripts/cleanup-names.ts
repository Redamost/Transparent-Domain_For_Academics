// ─── Clean up person name quality ───
// Fixes: names with suffixes (男/女), titles embedded in names,
//        duplicate entries, and wrong department values.
//
// Usage: npx tsx scripts/cleanup-names.ts [--dry-run]

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[Cleanup] Starting name/data cleanup${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // 1. Find persons with names containing ",男" or ",女" or any title suffix
  const badNames = await prisma.person.findMany({
    where: {
      isActive: true,
      OR: [
        { nameZh: { contains: '，男' } },
        { nameZh: { contains: '，女' } },
        { nameZh: { contains: '，' } },
        { nameZh: { contains: '职称' } },
      ],
    },
    select: { id: true, nameZh: true },
  });

  console.log(`[Cleanup] Found ${badNames.length} persons with name quality issues:`);
  for (const p of badNames.slice(0, 20)) {
    console.log(`  - "${p.nameZh}"`);
  }

  // 2. Fix bad department values (short/obviously wrong ones)
  const badDepts = await prisma.person.findMany({
    where: {
      isActive: true,
      department: { in: ['启明', '启明）', '启明)'] },
    },
    select: { id: true, nameZh: true, department: true },
  });

  console.log(`\n[Cleanup] Found ${badDepts.length} persons with bad department values:`);
  for (const p of badDepts) {
    console.log(`  - ${p.nameZh}: dept="${p.department}"`);
  }

  // 3. Fix names
  let fixedCount = 0;
  for (const p of badNames) {
    let newName = p.nameZh;

    // Remove ",男，" or ",女，" suffix and everything after
    newName = newName.replace(/[，,]\s*[男女][，,]\s*.*$/, '');
    // Remove trailing ",男" or ",女"
    newName = newName.replace(/[，,]\s*[男女]\s*$/, '');
    // Remove trailing comma
    newName = newName.replace(/[，,]\s*$/, '');
    // If name contains 职称 or other metadata, try to extract just the name
    const nameOnly = newName.match(/^([^\s，,]{2,4})/);
    if (nameOnly && nameOnly[1] !== newName) {
      newName = nameOnly[1];
    }

    if (newName !== p.nameZh && newName.length >= 2) {
      if (!DRY_RUN) {
        await prisma.person.update({
          where: { id: p.id },
          data: { nameZh: newName },
        });
      }
      fixedCount++;
      console.log(`  Fixed: "${p.nameZh}" → "${newName}"`);
    }
  }

  // 4. Fix bad departments by re-extracting from title
  for (const p of badDepts) {
    if (!DRY_RUN) {
      await prisma.person.update({
        where: { id: p.id },
        data: { department: null }, // Clear it — enrichment can re-fill
      });
    }
    console.log(`  Cleared bad dept for: ${p.nameZh} (was "${p.department}")`);
  }

  console.log(`\n[Cleanup] COMPLETE${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`[Cleanup] Names fixed: ${fixedCount} | Bad depts cleared: ${badDepts.length}`);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

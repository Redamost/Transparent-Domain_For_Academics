/**
 * Batch generates pinyin English names for scholars without nameEn.
 *
 * Uses pinyin-pro for accurate Chinese→pinyin conversion with:
 * - Compound surname recognition (欧阳, 司马, 上官, etc.)
 * - Multi-character given name handling
 * - Format: "GivenName Surname" (e.g., "Xiaobo Wang")
 *
 * Usage:
 *   npx tsx scripts/generate-pinyin-names.ts [--dry-run] [--limit=N]
 */

import { config } from 'dotenv';
config();

import { pinyin } from 'pinyin-pro';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : undefined;

/**
 * Known compound Chinese surnames (复姓).
 * pinyin-pro handles most of these, but we list them explicitly
 * so we can log when one is detected.
 */
const COMPOUND_SURNAMES = new Set([
  '欧阳', '司马', '上官', '诸葛', '东方', '独孤', '南宫', '夏侯',
  '尉迟', '公孙', '轩辕', '令狐', '慕容', '宇文', '长孙', '皇甫',
  '闾丘', '端木', '申屠', '呼延', '东郭', '南门', '羊舌', '微生',
  '公西', '颛孙', '壤驷', '公良', '漆雕', '乐正', '宰父', '谷梁',
  '拓跋', '夹谷', '公羊', '公冶', '宗政', '濮阳', '淳于', '单于',
  '太叔', '闻人', '钟离', '赫连',
]);

function generatePinyinName(nameZh: string): string | null {
  if (!nameZh || nameZh.length < 2) return null;

  // Clean the name: remove brackets, parentheses, whitespace
  const clean = nameZh.replace(/[（(][^)）]*[)）]/g, '').trim();
  if (clean.length < 2) return null;

  // Check for non-Chinese characters (already have English name in nameZh)
  if (/^[a-zA-Z\s.]+$/.test(clean)) return null;

  // Determine surname length
  let surnameLen = 1;
  if (clean.length >= 2 && COMPOUND_SURNAMES.has(clean.substring(0, 2))) {
    surnameLen = 2;
  }

  const surname = clean.substring(0, surnameLen);
  const givenName = clean.substring(surnameLen);

  if (!givenName) return null;

  try {
    // Convert surname (use surname mode for better accuracy)
    const surnamePinyin = pinyin(surname, {
      toneType: 'none',
      type: 'array',
    }).join('');

    // Convert given name (concatenate characters without space)
    const givenPinyin = pinyin(givenName, {
      toneType: 'none',
      type: 'array',
    }).join('');

    if (!surnamePinyin || !givenPinyin) return null;

    // Format: GivenName Surname (English convention)
    // Capitalize first letters
    const formattedGiven = givenPinyin.charAt(0).toUpperCase() + givenPinyin.slice(1);
    const formattedSurname = surnamePinyin.charAt(0).toUpperCase() + surnamePinyin.slice(1);

    return `${formattedGiven} ${formattedSurname}`;
  } catch (err) {
    console.error(`Error converting "${clean}":`, err);
    return null;
  }
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Find all active scholars without nameEn
  const scholars = await prisma.person.findMany({
    where: {
      isActive: true,
      OR: [
        { nameEn: null },
        { nameEn: '' },
      ],
    },
    select: { id: true, nameZh: true },
    orderBy: { id: 'asc' },
    take: LIMIT,
  });

  console.log(`Found ${scholars.length} scholars without English name`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const compoundFound: string[] = [];

  for (const scholar of scholars) {
    const nameEn = generatePinyinName(scholar.nameZh);

    if (!nameEn) {
      skipped++;
      if (skipped <= 10) {
        console.log(`  SKIP: "${scholar.nameZh}" — could not generate pinyin`);
      }
      continue;
    }

    // Check for compound surname
    const clean = scholar.nameZh.replace(/[（(][^)）]*[)）]/g, '').trim();
    if (clean.length >= 2 && COMPOUND_SURNAMES.has(clean.substring(0, 2))) {
      compoundFound.push(`${scholar.nameZh} → ${nameEn}`);
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] ${scholar.nameZh} → ${nameEn}`);
      generated++;
    } else {
      try {
        await prisma.person.update({
          where: { id: scholar.id },
          data: { nameEn },
        });
        generated++;
        if (generated % 100 === 0) {
          console.log(`  Progress: ${generated}/${scholars.length} names generated...`);
        }
      } catch (err) {
        failed++;
        console.error(`  FAILED: ${scholar.nameZh} — ${err}`);
      }
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Total without nameEn: ${scholars.length}`);
  console.log(`Generated: ${generated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  if (compoundFound.length > 0) {
    console.log(`\nCompound surnames detected (${compoundFound.length}):`);
    compoundFound.forEach(c => console.log(`  ${c}`));
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

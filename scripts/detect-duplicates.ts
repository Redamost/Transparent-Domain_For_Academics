// ─── Duplicate Person Detector ───
// Scans the database for potential duplicate person records.
// Uses name + institution + field similarity scoring.
//
// Usage: npx tsx scripts/detect-duplicates.ts
//   Outputs all pairs with similarity >= 0.7

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { canonicalizeName } from '../src/lib/scraping/normalizer';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

interface Candidate {
  id: string;
  nameZh: string;
  nameEn: string | null;
  institution: string | null;
  score: number;
}

async function main() {
  console.log('=== Duplicate Person Detector ===\n');

  // Get all active persons
  const allPersons = await prisma.person.findMany({
    where: { isActive: true },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      score: true,
    },
    orderBy: { nameZh: 'asc' },
  });

  console.log(`Total active persons: ${allPersons.length}\n`);

  // Group by name similarity
  const potentialDupes: { a: Candidate; b: Candidate; score: number }[] = [];

  for (let i = 0; i < allPersons.length; i++) {
    for (let j = i + 1; j < allPersons.length; j++) {
      const personA = allPersons[i];
      const personB = allPersons[j];

      const similarity = calculateSimilarity(personA, personB);

      if (similarity >= 0.7) {
        potentialDupes.push({
          a: {
            id: personA.id,
            nameZh: personA.nameZh,
            nameEn: personA.nameEn,
            institution: personA.institution,
            score: personA.score,
          },
          b: {
            id: personB.id,
            nameZh: personB.nameZh,
            nameEn: personB.nameEn,
            institution: personB.institution,
            score: personB.score,
          },
          score: Math.round(similarity * 100) / 100,
        });
      }
    }
  }

  if (potentialDupes.length === 0) {
    console.log('✅ No potential duplicates found (threshold: 0.7)');
    return;
  }

  // Sort by score descending
  potentialDupes.sort((a, b) => b.score - a.score);

  console.log(`Found ${potentialDupes.length} potential duplicate pairs:\n`);

  for (let idx = 0; idx < potentialDupes.length; idx++) {
    const dupe = potentialDupes[idx];
    console.log(`── Pair ${idx + 1}: Similarity ${dupe.score} ──`);
    console.log(`  [A] ${dupe.a.nameZh} (${dupe.a.nameEn || 'N/A'}) | ${dupe.a.institution || 'N/A'} | Score: ${dupe.a.score}`);
    console.log(`       ID: ${dupe.a.id}`);
    console.log(`  [B] ${dupe.b.nameZh} (${dupe.b.nameEn || 'N/A'}) | ${dupe.b.institution || 'N/A'} | Score: ${dupe.b.score}`);
    console.log(`       ID: ${dupe.b.id}`);

    if (dupe.score >= 0.85) {
      console.log(`  ⚠️  HIGH CONFIDENCE — recommend merging B into A`);
      console.log(`  Merge command: npx tsx scripts/merge-duplicates.ts ${dupe.a.id} ${dupe.b.id}`);
    } else {
      console.log(`  ⚡ MEDIUM CONFIDENCE — manual review recommended`);
    }
    console.log();
  }

  console.log('Done.');
}

/**
 * Simple similarity between two DB person records.
 * Name score (60%) + institution match (40%).
 */
function calculateSimilarity(
  a: { nameZh: string; nameEn: string | null; institution: string | null },
  b: { nameZh: string; nameEn: string | null; institution: string | null }
): number {
  let score = 0;
  let total = 0;

  // Name similarity (60%)
  const nameA = canonicalizeName(a.nameEn || a.nameZh);
  const nameB = canonicalizeName(b.nameEn || b.nameZh);
  const nameScore = trigramSimilarity(nameA, nameB);
  score += nameScore * 0.6;
  total += 0.6;

  // Institution match (40%)
  if (a.institution && b.institution) {
    const instA = a.institution.toLowerCase().trim();
    const instB = b.institution.toLowerCase().trim();
    if (instA === instB) {
      score += 0.4;
    } else if (instA.includes(instB) || instB.includes(instA)) {
      score += 0.25;
    }
  }
  total += 0.4;

  return total > 0 ? score / total : 0;
}

function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const trigramsA = getTrigrams(a.toLowerCase());
  const trigramsB = getTrigrams(b.toLowerCase());
  if (trigramsA.length === 0 && trigramsB.length === 0) return 0;

  const intersection = trigramsA.filter((t) => trigramsB.includes(t)).length;
  const union = new Set([...trigramsA, ...trigramsB]).size;
  return union > 0 ? intersection / union : 0;
}

function getTrigrams(s: string): string[] {
  const trigrams: string[] = [];
  const padded = `  ${s} `;
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.push(padded.substring(i, i + 3));
  }
  return trigrams;
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });

// ─── Pinyin Name Backfill ───
// Generates pinyin English names for scholars missing nameEn.
// Uses the shared PINYIN_MAP utility to convert nameZh → nameEn.
// Should be run as a prerequisite before enrichment to improve API matching.

import { prisma } from '@/lib/prisma';
import { generatePinyinFromChinese } from '@/lib/utils/pinyin';

export interface PinyinBackfillStats {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Backfill pinyin English names for scholars missing nameEn.
 * Processes at most `batchSize` scholars per call.
 * Returns stats for monitoring.
 */
export async function backfillPinyinNames(
  batchSize = 500,
): Promise<PinyinBackfillStats> {
  const stats: PinyinBackfillStats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  const candidates = await prisma.person.findMany({
    where: {
      isActive: true,
      nameZh: { not: '' },
      nameEn: null,
    },
    select: { id: true, nameZh: true },
    take: batchSize,
    orderBy: { score: 'desc' },
  });

  stats.processed = candidates.length;

  if (candidates.length === 0) {
    console.log('[Pinyin] No scholars need pinyin name generation');
    return stats;
  }

  console.log(
    `[Pinyin] Generating pinyin names for ${candidates.length} scholars...`,
  );

  for (const candidate of candidates) {
    try {
      const pinyin = generatePinyinFromChinese(candidate.nameZh);

      if (!pinyin) {
        stats.skipped++;
        continue;
      }

      await prisma.person.update({
        where: { id: candidate.id },
        data: {
          nameEn: pinyin,
          metadata: {
            pinyinGenerated: true,
            pinyinGeneratedAt: new Date().toISOString(),
          },
        },
      });

      stats.updated++;
    } catch (err) {
      stats.errors++;
      if (stats.errors <= 5) {
        console.error(
          `[Pinyin] Error generating name for ${candidate.nameZh}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Log to audit trail
  await prisma.auditLog
    .create({
      data: {
        action: 'PINYIN_BACKFILL',
        entityType: 'SYSTEM',
        newData: {
          processed: stats.processed,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors,
        },
      },
    })
    .catch(() => {
      // Non-critical — don't fail backfill for audit log issues
    });

  console.log(
    `[Pinyin] Backfill complete: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors (${stats.processed} total)`,
  );

  return stats;
}

/**
 * Get the current pinyin backlog size.
 */
export async function getPinyinBacklog(): Promise<{
  totalWithoutNameEn: number;
  totalActive: number;
}> {
  const [totalWithoutNameEn, totalActive] = await Promise.all([
    prisma.person.count({
      where: {
        isActive: true,
        nameZh: { not: '' },
        nameEn: null,
      },
    }),
    prisma.person.count({ where: { isActive: true } }),
  ]);

  return { totalWithoutNameEn, totalActive };
}

import { prisma } from '@/lib/prisma';
import { Prisma, ScoreCategory, RatingSource } from '@/generated/prisma/client';
import { BASELINE_SCORE, RATING_CATEGORY_WEIGHTS, MAX_SINGLE_REPORT_DELTA } from '@/lib/utils/constants';

/**
 * Calculate the current aggregate score for a person.
 * Reads the ScoreBreakdown table (denormalized) and applies category weights.
 */
export async function calculateAggregateScore(personId: string): Promise<number> {
  const breakdowns = await prisma.scoreBreakdown.findMany({
    where: { personId },
  });

  if (breakdowns.length === 0) {
    return BASELINE_SCORE;
  }

  let aggregate = 0;
  let totalWeight = 0;

  for (const breakdown of breakdowns) {
    const weight = RATING_CATEGORY_WEIGHTS[breakdown.category] || 0;
    aggregate += breakdown.value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round(aggregate / totalWeight * 100) / 100 : BASELINE_SCORE;
}

/**
 * Apply a rating delta to specific categories and update the person's aggregate score.
 * This MUST be called within a Prisma transaction.
 */
export async function applyRatingChange(
  tx: Prisma.TransactionClient,
  params: {
    personId: string;
    categoryDeltas: Record<string, number>;  // { "RESEARCH_QUALITY": -10, ... }
    source: RatingSource;
    reportId?: string;
    reviewerId?: string;
    notes?: string;
  }
): Promise<{ oldScore: number; newScore: number; delta: number }> {
  const { personId, categoryDeltas, source, reportId, reviewerId, notes } = params;

  // Get current person score
  const person = await tx.person.findUniqueOrThrow({
    where: { id: personId },
    select: { score: true },
  });

  const oldScore = person.score;

  // Apply each category delta
  for (const [category, rawDelta] of Object.entries(categoryDeltas)) {
    // Clamp delta
    const delta = Math.max(-MAX_SINGLE_REPORT_DELTA, Math.min(MAX_SINGLE_REPORT_DELTA, rawDelta));

    if (delta === 0) continue;

    const scoreCategory = category as ScoreCategory;

    // Get or create ScoreBreakdown
    const current = await tx.scoreBreakdown.findUnique({
      where: {
        personId_category: { personId, category: scoreCategory },
      },
    });

    const oldValue = current?.value ?? BASELINE_SCORE;
    const newValue = oldValue + delta;

    // Upsert ScoreBreakdown
    await tx.scoreBreakdown.upsert({
      where: {
        personId_category: { personId, category: scoreCategory },
      },
      create: {
        personId,
        category: scoreCategory,
        value: newValue,
      },
      update: {
        value: newValue,
      },
    });

    // Create RatingLog
    await tx.ratingLog.create({
      data: {
        personId,
        category: scoreCategory,
        oldValue,
        newValue,
        delta,
        source,
        reportId,
        reviewerId,
        notes,
      },
    });
  }

  // Recalculate aggregate score
  const breakdowns = await tx.scoreBreakdown.findMany({
    where: { personId },
  });

  let aggregate = 0;
  let totalWeight = 0;

  for (const breakdown of breakdowns) {
    const weight = RATING_CATEGORY_WEIGHTS[breakdown.category] || 0;
    aggregate += breakdown.value * weight;
    totalWeight += weight;
  }

  const newScore = totalWeight > 0
    ? Math.round((aggregate / totalWeight) * 100) / 100
    : BASELINE_SCORE;

  // Update person record
  await tx.person.update({
    where: { id: personId },
    data: {
      score: newScore,
      scoreUpdatedAt: new Date(),
    },
  });

  return {
    oldScore,
    newScore,
    delta: Math.round((newScore - oldScore) * 100) / 100,
  };
}

/**
 * Get score breakdown for display.
 */
export async function getScoreBreakdown(personId: string) {
  const breakdowns = await prisma.scoreBreakdown.findMany({
    where: { personId },
  });

  return Object.entries(RATING_CATEGORY_WEIGHTS).map(([category, weight]) => {
    const entry = breakdowns.find(b => b.category === category);
    return {
      category: category as ScoreCategory,
      value: entry?.value ?? BASELINE_SCORE,
      weight,
    };
  });
}

/**
 * Initialize ScoreBreakdown entries for a new person.
 */
export async function initializeScoreBreakdowns(
  tx: Prisma.TransactionClient,
  personId: string
) {
  const categories = Object.keys(RATING_CATEGORY_WEIGHTS) as ScoreCategory[];
  for (const category of categories) {
    await tx.scoreBreakdown.create({
      data: {
        personId,
        category,
        value: BASELINE_SCORE,
      },
    });
  }
}

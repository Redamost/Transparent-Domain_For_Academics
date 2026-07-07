import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getScoreBreakdown } from '@/lib/rating/calculator';
import { apiSuccess, notFound } from '@/lib/api/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const person = await prisma.person.findUnique({
    where: { id, isActive: true },
    select: { id: true, score: true },
  });

  if (!person) return notFound('Person');

  const [breakdown, ratingHistory] = await Promise.all([
    getScoreBreakdown(id),
    prisma.ratingLog.findMany({
      where: { personId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        category: true,
        oldValue: true,
        newValue: true,
        delta: true,
        source: true,
        notes: true,
        createdAt: true,
      },
    }),
  ]);

  return apiSuccess({
    score: person.score,
    breakdown,
    ratingHistory: ratingHistory.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

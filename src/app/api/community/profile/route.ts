import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, unauthorized } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateLevel, calculateAccuracy } from '@/lib/community/levels';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      transparencyLevel: true,
      levelExp: true,
      totalTasksCompleted: true,
      totalReportsApproved: true,
      totalReportsRejected: true,
      reportAccuracy: true,
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true,
    },
  });

  if (!user) return unauthorized();

  const levelProgress = calculateLevel(user.levelExp);

  // Recalculate accuracy in case it's stale
  const accuracy = calculateAccuracy(user.totalReportsApproved, user.totalReportsRejected);

  // Update accuracy if changed
  if (accuracy !== user.reportAccuracy) {
    await prisma.user.update({
      where: { id: userId },
      data: { reportAccuracy: accuracy },
    });
  }

  return apiSuccess({
    level: levelProgress.level,
    currentExp: levelProgress.currentExp,
    nextLevelExp: levelProgress.nextLevelExp,
    progress: levelProgress.progress,
    levelInfo: levelProgress.levelInfo,
    nextLevelInfo: levelProgress.nextLevelInfo,
    totalTasksCompleted: user.totalTasksCompleted,
    totalReportsApproved: user.totalReportsApproved,
    totalReportsRejected: user.totalReportsRejected,
    reportAccuracy: accuracy,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    lastActiveDate: user.lastActiveDate?.toISOString() || null,
  });
}

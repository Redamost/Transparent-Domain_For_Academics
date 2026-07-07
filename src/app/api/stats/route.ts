import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, unauthorized } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateLevel, calculateAccuracy, getStreakBonusExp } from '@/lib/community/levels';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const userId = (session.user as any).id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

  const [totalReports, approvedReports, rejectedReports, scoreChanges, todayReports, todayTasks] =
    await Promise.all([
      prisma.report.count({ where: { reporterId: userId } }),
      prisma.report.count({ where: { reporterId: userId, status: 'APPROVED' } }),
      prisma.report.count({ where: { reporterId: userId, status: 'REJECTED' } }),
      prisma.scoreChange.aggregate({
        where: { appliedBy: userId },
        _sum: { delta: true },
      }),
      prisma.report.count({
        where: {
          reporterId: userId,
          createdAt: { gte: today },
        },
      }),
      prisma.dailyTask.count({
        where: {
          userId,
          assignedAt: { gte: today },
        },
      }),
    ]);

  // Calculate actual streak
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let streak = user.currentStreak;
  if (user.lastActiveDate) {
    const lastActive = new Date(user.lastActiveDate);
    lastActive.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((todayDate.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
    // If last active was more than 1 day ago and not today, streak may be broken
    if (daysDiff > 1) {
      streak = 0;
    }
  } else {
    streak = 0;
  }

  // Calculate level progress
  const levelProgress = calculateLevel(user.levelExp);
  const accuracy = calculateAccuracy(user.totalReportsApproved, user.totalReportsRejected);

  return apiSuccess({
    totalReports,
    approvedReports,
    rejectedReports,
    scoreImpact: Math.abs(scoreChanges._sum.delta || 0),
    streak,
    longestStreak: user.longestStreak,
    todayTasks,
    transparencyLevel: levelProgress.level,
    levelExp: levelProgress.currentExp,
    nextLevelExp: levelProgress.nextLevelExp,
    levelProgress: levelProgress.progress,
    levelInfo: levelProgress.levelInfo,
    reportAccuracy: accuracy,
  });
}

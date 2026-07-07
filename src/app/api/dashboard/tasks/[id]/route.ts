import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, unauthorized, notFound } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateLevel, getTaskExpReward, getStreakBonusExp } from '@/lib/community/levels';
import { EXP_REWARDS } from '@/lib/utils/constants';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (userRole !== 'COMMUNITY' && userRole !== 'ADMIN') {
    return unauthorized('Only community participants can complete tasks');
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status = 'COMPLETED' } = body;

  if (!['COMPLETED', 'SKIPPED'].includes(status)) {
    return apiError(400, 'VALIDATION_ERROR', 'Status must be COMPLETED or SKIPPED');
  }

  // Find the task
  const task = await prisma.dailyTask.findUnique({
    where: { id },
  });

  if (!task) return notFound('Task');
  if (task.userId !== userId) {
    return apiError(403, 'FORBIDDEN', 'This is not your task');
  }
  if (task.status !== 'PENDING') {
    return apiError(409, 'CONFLICT', 'Task is already completed or skipped');
  }

  // Update task in a transaction with user exp update
  const result = await prisma.$transaction(async (tx) => {
    // Mark task as completed
    const updatedTask = await tx.dailyTask.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
    });

    if (status === 'SKIPPED') {
      return { task: updatedTask, levelProgress: null };
    }

    // Get current user
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // Calculate EXP gain
    let expGain = getTaskExpReward(task.taskType);

    // Update streak
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStreak = user.currentStreak;
    let newLongestStreak = user.longestStreak;

    if (user.lastActiveDate) {
      const lastActive = new Date(user.lastActiveDate);
      lastActive.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff === 0) {
        // Already active today, no streak change
      } else if (daysDiff === 1) {
        // Consecutive day
        newStreak = user.currentStreak + 1;
        if (newStreak > user.longestStreak) {
          newLongestStreak = newStreak;
        }
      } else {
        // Streak broken
        newStreak = 1;
      }
    } else {
      // First activity ever
      newStreak = 1;
      newLongestStreak = 1;
    }

    // Add streak bonus
    const streakBonus = getStreakBonusExp(newStreak);
    if (streakBonus > 0 && newStreak > user.currentStreak) {
      expGain += streakBonus;
    }

    // Update user
    const newTotalExp = user.levelExp + expGain;
    const newLevelProgress = calculateLevel(newTotalExp);

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        levelExp: newTotalExp,
        transparencyLevel: newLevelProgress.level,
        totalTasksCompleted: user.totalTasksCompleted + 1,
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        lastActiveDate: new Date(),
      },
    });

    return {
      task: updatedTask,
      levelProgress: {
        level: newLevelProgress.level,
        currentExp: newLevelProgress.currentExp,
        nextLevelExp: newLevelProgress.nextLevelExp,
        progress: newLevelProgress.progress,
        levelInfo: newLevelProgress.levelInfo,
        nextLevelInfo: newLevelProgress.nextLevelInfo,
      },
      expGained: expGain,
      streak: newStreak,
    };
  });

  return apiSuccess(result);
}

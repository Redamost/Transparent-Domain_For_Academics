import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, unauthorized } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (userRole !== 'COMMUNITY' && userRole !== 'ADMIN') {
    return unauthorized('Only community participants can access tasks');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let tasks = await prisma.dailyTask.findMany({
    where: {
      userId,
      assignedAt: { gte: today },
    },
    orderBy: { createdAt: 'desc' },
  });

  // If no tasks assigned today, auto-assign
  if (tasks.length === 0) {
    // Find fields the user is interested in or random active fields
    const fields = await prisma.field.findMany({
      where: { level: { gte: 1 } },
      take: 3,
      orderBy: { sortOrder: 'asc' },
    });

    for (const field of fields) {
      await prisma.dailyTask.create({
        data: {
          userId,
          fieldId: field.id,
          title: `Monitor ${field.nameEn} for new research activity`,
          description: `Check recent publications and updates in ${field.nameZh} (${field.nameEn}). Report any academic misconduct or exceptionally rigorous research you find.`,
          status: 'PENDING',
        },
      });
    }

    tasks = await prisma.dailyTask.findMany({
      where: { userId, assignedAt: { gte: today } },
      orderBy: { createdAt: 'desc' },
    });
  }

  return apiSuccess(tasks);
}

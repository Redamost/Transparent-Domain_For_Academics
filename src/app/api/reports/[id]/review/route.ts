import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reviewReportSchema } from '@/lib/api/validation';
import { apiSuccess, apiError, unauthorized, validationError } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { applyRatingChange } from '@/lib/rating/calculator';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (userRole !== 'ADMIN') {
    return apiError(403, 'FORBIDDEN', 'Only admins can review reports');
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = reviewReportSchema.safeParse(body);
  if (!parsed.success) {
    return validationError('Invalid input', parsed.error.flatten());
  }

  const { action, notes, scoreDelta } = parsed.data;

  const report = await prisma.report.findUnique({
    where: { id },
    select: { id: true, status: true, personId: true },
  });

  if (!report) {
    return apiError(404, 'NOT_FOUND', 'Report not found');
  }

  if (report.status !== 'PENDING' && report.status !== 'UNDER_REVIEW') {
    return apiError(409, 'CONFLICT', 'Report has already been reviewed');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Create review record
    await tx.reportReview.create({
      data: {
        reportId: id,
        reviewerId: userId,
        action,
        notes,
      },
    });

    if (action === 'APPROVE') {
      // Apply score changes if provided
      if (scoreDelta && Object.keys(scoreDelta).length > 0) {
        const { oldScore, newScore, delta } = await applyRatingChange(tx, {
          personId: report.personId,
          categoryDeltas: scoreDelta,
          source: 'COMMUNITY',
          reportId: id,
          reviewerId: userId,
          notes: notes || 'Report approved',
        });

        // Create score change record
        await tx.scoreChange.create({
          data: {
            reportId: id,
            personId: report.personId,
            oldScore,
            newScore,
            delta,
            appliedBy: userId,
          },
        });

        // Update report status
        await tx.report.update({
          where: { id },
          data: {
            status: 'APPROVED',
            adminNotes: notes,
            reviewedAt: new Date(),
          },
        });

        return { action: 'APPROVED', oldScore, newScore, delta };
      }

      // Approve without score change
      await tx.report.update({
        where: { id },
        data: {
          status: 'APPROVED',
          adminNotes: notes,
          reviewedAt: new Date(),
        },
      });

      return { action: 'APPROVED', oldScore: null, newScore: null, delta: 0 };
    }

    // Reject
    await tx.report.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNotes: notes,
        rejectionReason: notes,
        reviewedAt: new Date(),
      },
    });

    return { action: 'REJECTED' };
  });

  return apiSuccess({
    reportId: id,
    ...result,
  });
}

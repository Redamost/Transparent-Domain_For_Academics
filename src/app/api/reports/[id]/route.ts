import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, notFound, unauthorized } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const { id } = await params;
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, name: true } },
      person: { select: { id: true, nameZh: true, nameEn: true } },
      evidences: true,
      reviews: {
        include: { reviewer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!report) return notFound('Report');

  // Only the reporter or admin can view full details
  if (report.reporterId !== userId && userRole !== 'ADMIN') {
    return notFound('Report');
  }

  return apiSuccess({
    id: report.id,
    reporterId: report.reporterId,
    reporterName: report.reporter.name || 'Unknown',
    personId: report.personId,
    personName: report.person.nameZh,
    category: report.category,
    title: report.title,
    description: report.description,
    status: report.status,
    severity: report.severity,
    adminNotes: report.adminNotes,
    rejectionReason: report.rejectionReason,
    createdAt: report.createdAt.toISOString(),
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    evidences: report.evidences.map(e => ({
      id: e.id,
      type: e.type,
      url: e.url,
      fileName: e.fileName,
      caption: e.caption,
    })),
    reviews: report.reviews.map(r => ({
      action: r.action,
      notes: r.notes,
      reviewerName: r.reviewer.name || 'Unknown',
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

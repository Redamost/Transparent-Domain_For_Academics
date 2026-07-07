import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createReportSchema, reportQuerySchema } from '@/lib/api/validation';
import { getPaginationParams, buildPaginatedResponse } from '@/lib/api/pagination';
import { apiSuccess, apiError, unauthorized, validationError } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;
  const isAdmin = userRole === 'ADMIN';

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = reportQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    return validationError('Invalid query parameters', parsed.error.flatten());
  }

  const { status, category, personId, page, limit } = parsed.data;
  const { skip, take } = getPaginationParams(page, limit);

  const where: any = {};

  if (!isAdmin) {
    where.reporterId = userId; // Non-admins only see their own reports
  }

  if (status) where.status = status;
  if (category) where.category = category;
  if (personId) where.personId = personId;

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        reporter: { select: { name: true } },
        person: { select: { nameZh: true, nameEn: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);

  const data = reports.map(r => ({
    id: r.id,
    reporterId: r.reporterId,
    reporterName: r.reporter.name || 'Unknown',
    personId: r.personId,
    personName: r.person.nameZh,
    category: r.category,
    title: r.title,
    status: r.status,
    severity: r.severity,
    createdAt: r.createdAt.toISOString(),
  }));

  return apiSuccess(buildPaginatedResponse(data, total, page, limit));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  if (userRole !== 'COMMUNITY' && userRole !== 'ADMIN') {
    return apiError(403, 'FORBIDDEN', 'Only community participants can submit reports');
  }

  const body = await req.json();
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    return validationError('Invalid input', parsed.error.flatten());
  }

  const { personId, category, title, description, severity, evidenceIds } = parsed.data;

  // Check rate limits
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayCount, weekPersonCount] = await Promise.all([
    prisma.report.count({
      where: {
        reporterId: userId,
        createdAt: { gte: today },
      },
    }),
    prisma.report.count({
      where: {
        reporterId: userId,
        personId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  if (todayCount >= 5) {
    return apiError(429, 'RATE_LIMITED', 'Maximum 5 reports per day');
  }

  if (weekPersonCount >= 2) {
    return apiError(429, 'RATE_LIMITED', 'Maximum 2 reports per person per week');
  }

  // Verify person exists
  const person = await prisma.person.findUnique({
    where: { id: personId, isActive: true },
  });
  if (!person) {
    return apiError(404, 'NOT_FOUND', 'Person not found');
  }

  // Create report
  const report = await prisma.report.create({
    data: {
      reporterId: userId,
      personId,
      category,
      title,
      description,
      severity,
      status: 'PENDING',
    },
  });

  // Link evidence
  if (evidenceIds.length > 0) {
    await prisma.reportEvidence.updateMany({
      where: { id: { in: evidenceIds }, reportId: '' },
      data: { reportId: report.id },
    });
  }

  return apiSuccess({
    id: report.id,
    message: 'Report submitted successfully. Awaiting admin review.',
  }, 201);
}

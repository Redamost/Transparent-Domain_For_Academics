import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchQuerySchema } from '@/lib/api/validation';
import { getPaginationParams, buildPaginatedResponse } from '@/lib/api/pagination';
import { apiSuccess, validationError } from '@/lib/api/errors';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = searchQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    return validationError('Invalid query parameters', parsed.error.flatten());
  }

  const { q, field, institution, minScore, maxScore, type, page, limit } = parsed.data;
  const { skip, take } = getPaginationParams(page, limit);

  if (type === 'publication') {
    // Search publications
    const where: any = {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { authors: { contains: q, mode: 'insensitive' } },
        { journal: { contains: q, mode: 'insensitive' } },
      ],
    };

    const [publications, total] = await Promise.all([
      prisma.publication.findMany({
        where,
        orderBy: { year: 'desc' },
        skip,
        take,
        include: {
          person: { select: { id: true, nameZh: true, nameEn: true } },
        },
      }),
      prisma.publication.count({ where }),
    ]);

    return apiSuccess(buildPaginatedResponse(publications, total, page, limit));
  }

  // Search persons (default) - use PostgreSQL full-text search or simple contains
  const where: any = {
    isActive: true,
    OR: [
      { nameZh: { contains: q, mode: 'insensitive' } },
      { nameEn: { contains: q, mode: 'insensitive' } },
      { institution: { contains: q, mode: 'insensitive' } },
      { department: { contains: q, mode: 'insensitive' } },
    ],
  };

  if (field) {
    where.fields = { some: { field: { slug: field } } };
  }

  if (institution) {
    where.institution = { contains: institution, mode: 'insensitive' };
  }

  if (minScore !== undefined || maxScore !== undefined) {
    where.score = {};
    if (minScore !== undefined) where.score.gte = minScore;
    if (maxScore !== undefined) where.score.lte = maxScore;
  }

  const [persons, total] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { score: 'desc' },
      skip,
      take,
      include: {
        fields: {
          where: { isPrimary: true },
          include: { field: true },
        },
      },
    }),
    prisma.person.count({ where }),
  ]);

  const data = persons.map(p => ({
    id: p.id,
    nameZh: p.nameZh,
    nameEn: p.nameEn,
    title: p.title,
    institution: p.institution,
    avatarUrl: p.avatarUrl,
    score: p.score,
    hIndex: p.hIndex,
    citationCount: p.citationCount,
    primaryFields: p.fields.map(pf => ({
      slug: pf.field.slug,
      nameZh: pf.field.nameZh,
      nameEn: pf.field.nameEn,
    })),
  }));

  return apiSuccess(buildPaginatedResponse(data, total, page, limit));
}

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { personQuerySchema, createPersonSchema } from '@/lib/api/validation';
import { getPaginationParams, buildPaginatedResponse } from '@/lib/api/pagination';
import { apiSuccess, apiError, unauthorized, validationError } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { initializeScoreBreakdowns } from '@/lib/rating/calculator';
import { deduplicatePerson } from '@/lib/scraping/deduplicator';
import type { NormalizedPerson } from '@/lib/scraping/types';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = personQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    return validationError('Invalid query parameters', parsed.error.flatten());
  }

  const { field, name, institution, minScore, maxScore, page, limit, sort } = parsed.data;
  const { skip, take } = getPaginationParams(page, limit);

  // Build where clause
  const where: any = { isActive: true };

  if (field) {
    where.fields = { some: { field: { slug: field } } };
  }

  if (name) {
    where.OR = [
      { nameZh: { contains: name, mode: 'insensitive' } },
      { nameEn: { contains: name, mode: 'insensitive' } },
    ];
  }

  if (institution) {
    where.institution = { contains: institution, mode: 'insensitive' };
  }

  if (minScore !== undefined || maxScore !== undefined) {
    where.score = {};
    if (minScore !== undefined) where.score.gte = minScore;
    if (maxScore !== undefined) where.score.lte = maxScore;
  }

  // Build orderBy
  let orderBy: any = { score: 'desc' };
  switch (sort) {
    case 'score_asc': orderBy = { score: 'asc' }; break;
    case 'name_asc': orderBy = { nameZh: 'asc' }; break;
    case 'name_desc': orderBy = { nameZh: 'desc' }; break;
    case 'hIndex_desc': orderBy = { hIndex: 'desc' }; break;
  }

  const [persons, total] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true, nameZh: true, nameEn: true, title: true, institution: true,
        avatarUrl: true, score: true, hIndex: true, citationCount: true, metadata: true,
        fields: {
          where: { isPrimary: true },
          select: { field: { select: { slug: true, nameZh: true, nameEn: true } } },
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
    metadata: p.metadata,
    primaryFields: p.fields.map(pf => ({
      slug: pf.field.slug,
      nameZh: pf.field.nameZh,
      nameEn: pf.field.nameEn,
    })),
  }));

  return apiSuccess(buildPaginatedResponse(data, total, page, limit));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  if ((session.user as any).role !== 'ADMIN') {
    return apiError(403, 'FORBIDDEN', 'Only admins can create persons');
  }

  const body = await req.json();
  const parsed = createPersonSchema.safeParse(body);
  if (!parsed.success) {
    return validationError('Invalid input', parsed.error.flatten());
  }

  const { fieldIds, primaryFieldId, ...personData } = parsed.data;

  // ─── Deduplication check ───
  // Build a NormalizedPerson-like object for the dedup engine
  const dedupCandidate: NormalizedPerson = {
    id: '',
    nameZh: personData.nameZh || null,
    nameEn: personData.nameEn || null,
    alternativeNames: personData.alternativeNames
      ? (typeof personData.alternativeNames === 'string'
          ? JSON.parse(personData.alternativeNames)
          : [personData.alternativeNames])
      : [],
    title: personData.title || null,
    institution: personData.institution || null,
    department: personData.department || null,
    orcidId: personData.orcidId || null,
    googleScholarId: personData.googleScholarId || null,
    researchGateId: personData.researchGateId || null,
    semanticScholarId: null,
    email: personData.email || null,
    website: personData.website || null,
    avatarUrl: null,
    bio: null,
    hIndex: null,
    citationCount: null,
    publicationCount: null,
    fields: fieldIds,
    publications: [],
    researchUpdates: [],
    competitionUpdates: [],
    evaluationUpdates: [],
    sources: ['MANUAL'],
    confidence: 1.0,
    metadata: {},
  };

  const dedupResult = await deduplicatePerson(dedupCandidate);

  if (dedupResult.matched && dedupResult.existingPersonId) {
    if (dedupResult.confidence >= 0.85) {
      // High confidence duplicate — block creation
      return apiError(409, 'DUPLICATE_PERSON', dedupResult.reason, {
        existingPersonId: dedupResult.existingPersonId,
        confidence: dedupResult.confidence,
      });
    }
    // Medium confidence — allow but warn
    if (dedupResult.confidence >= 0.65) {
      console.warn(
        `[Persons API] Possible duplicate: new person "${personData.nameZh}" matches existing ${dedupResult.existingPersonId} (confidence: ${dedupResult.confidence.toFixed(2)})`
      );
    }
  }

  const person = await prisma.$transaction(async (tx) => {
    const p = await tx.person.create({ data: personData });

    // Create field associations
    for (const fieldId of fieldIds) {
      await tx.personField.create({
        data: {
          personId: p.id,
          fieldId,
          isPrimary: fieldId === primaryFieldId,
        },
      });
    }

    // Initialize score breakdowns
    await initializeScoreBreakdowns(tx, p.id);

    return p;
  }).catch((err) => {
    // Handle Prisma unique constraint violations
    if (err?.code === 'P2002') {
      const target = (err?.meta?.target as string[]) || [];
      if (target.includes('orcidId')) {
        return apiError(409, 'DUPLICATE_ORCID', 'A person with this ORCID ID already exists');
      }
      if (target.includes('googleScholarId')) {
        return apiError(409, 'DUPLICATE_SCHOLAR_ID', 'A person with this Google Scholar ID already exists');
      }
      if (target.includes('researchGateId')) {
        return apiError(409, 'DUPLICATE_RESEARCHGATE_ID', 'A person with this ResearchGate ID already exists');
      }
      return apiError(409, 'DUPLICATE', 'A unique constraint violation occurred');
    }
    // Re-throw unknown errors
    throw err;
  });

  // .catch() may return an error response directly; check and return it
  if (person instanceof Response) return person;

  return apiSuccess(person, 201);
}

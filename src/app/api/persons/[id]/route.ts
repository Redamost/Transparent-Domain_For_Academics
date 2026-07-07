import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updatePersonSchema } from '@/lib/api/validation';
import { apiSuccess, apiError, notFound, unauthorized, validationError } from '@/lib/api/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deduplicatePerson } from '@/lib/scraping/deduplicator';
import type { NormalizedPerson } from '@/lib/scraping/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      fields: {
        include: { field: true },
      },
      publications: {
        orderBy: { year: 'desc' },
        take: 20,
      },
      researchUpdates: {
        orderBy: { publishedAt: 'desc' },
        take: 10,
      },
      competitionUpdates: {
        orderBy: { publishedAt: 'desc' },
        take: 10,
      },
      evaluationUpdates: {
        orderBy: { publishedAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!person || !person.isActive) {
    return notFound('Person');
  }

  return apiSuccess({
    id: person.id,
    nameZh: person.nameZh,
    nameEn: person.nameEn,
    alternativeNames: person.alternativeNames,
    title: person.title,
    institution: person.institution,
    department: person.department,
    orcidId: person.orcidId,
    googleScholarId: person.googleScholarId,
    researchGateId: person.researchGateId,
    email: person.email,
    website: person.website,
    bioZh: person.bioZh,
    bioEn: person.bioEn,
    avatarUrl: person.avatarUrl,
    hIndex: person.hIndex,
    citationCount: person.citationCount,
    publicationCount: person.publicationCount,
    score: person.score,
    scoreUpdatedAt: person.scoreUpdatedAt,
    lastScrapedAt: person.lastScrapedAt,
    isVerified: person.isVerified,
    fields: person.fields.map(pf => ({
      slug: pf.field.slug,
      nameZh: pf.field.nameZh,
      nameEn: pf.field.nameEn,
      isPrimary: pf.isPrimary,
    })),
    publications: person.publications,
    researchUpdates: person.researchUpdates,
    competitionUpdates: person.competitionUpdates,
    evaluationUpdates: person.evaluationUpdates,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  if ((session.user as any).role !== 'ADMIN') {
    return unauthorized('Only admins can update persons');
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updatePersonSchema.safeParse(body);
  if (!parsed.success) {
    return validationError('Invalid input', parsed.error.flatten());
  }

  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) return notFound('Person');

  const { fieldIds, primaryFieldId, ...personData } = parsed.data;

  // ─── Deduplication check (only when name or institution changes) ───
  const nameChanged = (personData.nameZh && personData.nameZh !== existing.nameZh)
    || (personData.nameEn && personData.nameEn !== existing.nameEn);
  const institutionChanged = personData.institution && personData.institution !== existing.institution;

  if (nameChanged || institutionChanged) {
    const dedupCandidate: NormalizedPerson = {
      id: '',
      nameZh: personData.nameZh || existing.nameZh || null,
      nameEn: personData.nameEn || existing.nameEn || null,
      alternativeNames: [],
      title: personData.title || existing.title || null,
      institution: personData.institution || existing.institution || null,
      department: personData.department || existing.department || null,
      orcidId: personData.orcidId || existing.orcidId || null,
      googleScholarId: personData.googleScholarId || existing.googleScholarId || null,
      researchGateId: personData.researchGateId || existing.researchGateId || null,
      semanticScholarId: null,
      email: null,
      website: null,
      avatarUrl: null,
      bio: null,
      hIndex: null,
      citationCount: null,
      publicationCount: null,
      fields: fieldIds || [],
      publications: [],
      researchUpdates: [],
      competitionUpdates: [],
      evaluationUpdates: [],
      sources: ['MANUAL'],
      confidence: 1.0,
      metadata: {},
    };

    const dedupResult = await deduplicatePerson(dedupCandidate);

    if (dedupResult.matched && dedupResult.existingPersonId && dedupResult.existingPersonId !== id) {
      if (dedupResult.confidence >= 0.85) {
        return apiError(409, 'DUPLICATE_PERSON',
          `This edit would create a duplicate: ${dedupResult.reason}`,
          { existingPersonId: dedupResult.existingPersonId, confidence: dedupResult.confidence }
        );
      }
      // Medium confidence — allow but warn in console
      if (dedupResult.confidence >= 0.65) {
        console.warn(
          `[Persons API] Possible duplicate via edit: person "${id}" → matches existing ${dedupResult.existingPersonId} (confidence: ${dedupResult.confidence.toFixed(2)})`
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.person.update({ where: { id }, data: personData });

    if (fieldIds) {
      // Remove existing field associations
      await tx.personField.deleteMany({ where: { personId: id } });
      // Create new associations
      for (const fieldId of fieldIds) {
        await tx.personField.create({
          data: {
            personId: id,
            fieldId,
            isPrimary: fieldId === primaryFieldId,
          },
        });
      }
    }
  }).catch((err) => {
    if (err?.code === 'P2002') {
      const target = (err?.meta?.target as string[]) || [];
      if (target.includes('orcidId')) {
        return apiError(409, 'DUPLICATE_ORCID', 'A person with this ORCID ID already exists');
      }
      if (target.includes('googleScholarId')) {
        return apiError(409, 'DUPLICATE_SCHOLAR_ID', 'A person with this Google Scholar ID already exists');
      }
      return apiError(409, 'DUPLICATE', 'A unique constraint violation occurred');
    }
    throw err;
  });

  const updated = await prisma.person.findUnique({ where: { id } });
  return apiSuccess(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  if ((session.user as any).role !== 'ADMIN') {
    return unauthorized('Only admins can delete persons');
  }

  const { id } = await params;
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) return notFound('Person');

  // Soft delete
  await prisma.person.update({ where: { id }, data: { isActive: false } });

  return apiSuccess({ message: 'Person deactivated' });
}

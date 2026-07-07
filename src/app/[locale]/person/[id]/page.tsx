import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PersonProfile } from '@/components/person/PersonProfile';
import type { PersonDetail } from '@/types';

export const revalidate = 3600;

async function getPerson(id: string): Promise<PersonDetail | null> {
  const person = await prisma.person.findUnique({
    where: { id, isActive: true },
    include: {
      fields: {
        include: { field: true },
      },
      publications: {
        orderBy: { year: 'desc' },
        take: 50,
      },
      researchUpdates: {
        orderBy: { publishedAt: 'desc' },
        take: 20,
      },
      competitionUpdates: {
        orderBy: { publishedAt: 'desc' },
        take: 20,
      },
      evaluationUpdates: {
        orderBy: { publishedAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!person) return null;

  return {
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
    scoreUpdatedAt: person.scoreUpdatedAt.toISOString(),
    lastScrapedAt: person.lastScrapedAt?.toISOString() ?? null,
    isVerified: person.isVerified,
    primaryFields: person.fields
      .filter(pf => pf.isPrimary)
      .map(pf => ({
        slug: pf.field.slug,
        nameZh: pf.field.nameZh,
        nameEn: pf.field.nameEn,
      })),
    fields: person.fields.map(pf => ({
      slug: pf.field.slug,
      nameZh: pf.field.nameZh,
      nameEn: pf.field.nameEn,
      isPrimary: pf.isPrimary,
    })),
    publications: person.publications.map(p => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      journal: p.journal,
      year: p.year,
      doi: p.doi,
      url: p.url,
      citationCount: p.citationCount,
    })),
    researchUpdates: person.researchUpdates.map(u => ({
      id: u.id,
      title: u.title,
      description: u.description,
      url: u.url,
      source: u.source,
      publishedAt: u.publishedAt?.toISOString() ?? null,
    })),
    competitionUpdates: person.competitionUpdates.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      url: c.url,
      source: c.source,
      level: c.level,
      award: c.award,
      publishedAt: c.publishedAt?.toISOString() ?? null,
    })),
    evaluationUpdates: person.evaluationUpdates.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      url: e.url,
      source: e.source,
      evalType: e.evalType,
      result: e.result,
      publishedAt: e.publishedAt?.toISOString() ?? null,
    })),
  };
}

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const person = await getPerson(id);

  if (!person) notFound();

  return <PersonProfile person={person} />;
}

import { prisma } from '@/lib/prisma';
import { HomePageClient } from '@/components/home/HomePageClient';

async function getHomeData() {
  try {
    const [fields, topResearchers, lowScoreResults, totalPersons, totalFields] = await Promise.all([
      prisma.field.findMany({
        where: { level: 0 },
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            orderBy: { sortOrder: 'asc' },
            include: {
              children: { orderBy: { sortOrder: 'asc' } },
              _count: { select: { persons: true } },
            },
          },
          _count: { select: { persons: true } },
        },
      }),
      prisma.person.findMany({
        where: { isActive: true },
        orderBy: { score: 'desc' },
        take: 9,
        include: {
          fields: {
            where: { isPrimary: true },
            include: { field: true },
          },
        },
      }),
      prisma.person.findMany({
        where: { isActive: true },
        orderBy: { score: 'asc' },
        take: 9,
        include: {
          fields: {
            where: { isPrimary: true },
            include: { field: true },
          },
        },
      }),
      prisma.person.count({ where: { isActive: true } }),
      prisma.field.count(),
    ]);

    const mapPerson = (p: typeof topResearchers[number]) => ({
      id: p.id,
      nameZh: p.nameZh,
      nameEn: p.nameEn,
      title: p.title,
      institution: p.institution,
      avatarUrl: p.avatarUrl,
      score: p.score,
      hIndex: p.hIndex,
      citationCount: p.citationCount,
      primaryFields: p.fields.map((pf) => ({
        slug: pf.field.slug,
        nameZh: pf.field.nameZh,
        nameEn: pf.field.nameEn,
      })),
    });

    const researchers = topResearchers.map(mapPerson);
    const lowScoreResearchers = lowScoreResults.map(mapPerson);

    return { fields, researchers, lowScoreResearchers, totalPersons, totalFields };
  } catch (e) {
    console.error('Failed to fetch home data:', e);
    return { fields: [], researchers: [], lowScoreResearchers: [], totalPersons: 0, totalFields: 0 };
  }
}

export default async function HomePage() {
  const data = await getHomeData();

  return <HomePageClient {...data} />;
}

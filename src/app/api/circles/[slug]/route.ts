import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';

interface CircleMember {
  id: string;
  nameZh: string;
  nameEn: string | null;
  title: string | null;
  institution: string | null;
  score: number;
  hIndex: number | null;
  citationCount: number | null;
  avatarUrl: string | null;
}

interface CircleDetail {
  slug: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  type: string;
  memberCount: number;
  avgScore: number;
  topPersonId: string | null;
  topPersonName: string | null;
  members: CircleMember[];
  scoreDistribution: { range: string; count: number }[];
  topInstitutions: { institution: string; count: number }[];
}

/**
 * GET /api/circles/[slug]
 * Detail for one academic circle with member list and statistics.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const [type, ...keyParts] = slug.split('-');
    const key = keyParts.join('-');

    if (!type || !key) return notFound();

    const circle = await buildCircleDetail(type, key, slug);
    if (!circle) return notFound();

    return Response.json({ data: circle });
  } catch (error) {
    console.error('[Circle Detail API] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function buildCircleDetail(
  type: string,
  key: string,
  fullSlug: string
): Promise<CircleDetail | null> {
  let whereClause: any = { isActive: true };
  let nameZh = '';
  let nameEn = '';
  let descriptionZh = '';
  let descriptionEn = '';

  if (type === 'field') {
    // Find field by slug
    const field = await prisma.field.findUnique({ where: { slug: key } });
    if (!field) return null;
    nameZh = field.nameZh;
    nameEn = field.nameEn || key;
    descriptionZh = field.descriptionZh || `${field.nameZh}领域的研究人员群体`;
    descriptionEn = field.descriptionEn || `Research community in ${field.nameEn}`;

    // Match persons in this field or sub-fields
    const subFieldIds = await getAllSubFieldIds(field.id);
    const allFieldIds = [field.id, ...subFieldIds];

    whereClause = {
      isActive: true,
      fields: { some: { fieldId: { in: allFieldIds } } },
    };
  } else if (type === 'institution') {
    // Decode institution from slug
    const persons2 = await prisma.person.findMany({
      where: { isActive: true, institution: { not: null } },
      select: { institution: true },
    });
    // Try ASCII-clean slug match first, then fallback to URI-decoded match
    let institution = persons2.find(
      (p) => p.institution!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === key
    )?.institution;
    if (!institution) {
      const decoded = decodeURIComponent(key);
      institution = persons2.find((p) => p.institution === decoded)?.institution;
    }

    if (!institution) return null;
    nameZh = institution;
    nameEn = institution;
    descriptionZh = `${institution}的研究人员群体`;
    descriptionEn = `Researchers from ${institution}`;
    whereClause = { isActive: true, institution };
  } else if (type === 'region') {
    nameZh = key === '海外' ? '海外' : key;
    nameEn = key;
    descriptionZh = `${nameZh}地区的研究人员群体`;
    descriptionEn = `Researchers in ${key} region`;
    whereClause = { isActive: true, region: key };
  } else {
    return null;
  }

  // Fetch members
  const members = await prisma.person.findMany({
    where: whereClause,
    orderBy: { score: 'desc' },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      title: true,
      institution: true,
      score: true,
      hIndex: true,
      citationCount: true,
      avatarUrl: true,
    },
  });

  const avgScore = members.length > 0
    ? Math.round(members.reduce((s, m) => s + m.score, 0) / members.length * 10) / 10
    : 100.0;

  const topPerson = members.length > 0 ? members[0] : null;

  // Score distribution
  const ranges = [
    { min: 0, max: 70, label: '< 70' },
    { min: 70, max: 85, label: '70-85' },
    { min: 85, max: 100, label: '85-100' },
    { min: 100, max: 110, label: '100-110' },
    { min: 110, max: 200, label: '> 110' },
  ];
  const scoreDistribution = ranges.map((r) => ({
    range: r.label,
    count: members.filter((m) => m.score >= r.min && m.score < r.max).length,
  }));

  // Top institutions within this circle
  const instCounts = new Map<string, number>();
  for (const m of members) {
    if (m.institution) {
      instCounts.set(m.institution, (instCounts.get(m.institution) || 0) + 1);
    }
  }
  const topInstitutions = Array.from(instCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([institution, count]) => ({ institution, count }));

  return {
    slug: fullSlug,
    nameZh,
    nameEn,
    descriptionZh,
    descriptionEn,
    type: type.toUpperCase(),
    memberCount: members.length,
    avgScore,
    topPersonId: topPerson?.id || null,
    topPersonName: topPerson?.nameZh || null,
    members,
    scoreDistribution,
    topInstitutions,
  };
}

async function getAllSubFieldIds(fieldId: string): Promise<string[]> {
  const children = await prisma.field.findMany({
    where: { parentId: fieldId },
    select: { id: true },
  });
  const ids = children.map((c) => c.id);
  for (const child of children) {
    const subIds = await getAllSubFieldIds(child.id);
    ids.push(...subIds);
  }
  return ids;
}

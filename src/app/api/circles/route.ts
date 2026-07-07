import { prisma } from '@/lib/prisma';

/**
 * GET /api/circles
 * List academic circles grouped by type: field, institution, region.
 * Each circle is an aggregation of Person data by the grouping dimension.
 */
export async function GET() {
  try {
    // ─── 1. Field circles — aggregate by top-level field ───
    const fieldCircles = await prisma.field.findMany({
      where: { level: 0 },
      orderBy: { sortOrder: 'asc' },
    });

    const fieldResults = await Promise.all(
      fieldCircles.map(async (field) => {
        const persons = await prisma.personField.findMany({
          where: {
            field: {
              OR: [
                { id: field.id },
                { parentId: field.id },
                { parent: { parentId: field.id } },
              ],
            },
          },
          include: {
            person: { select: { id: true, score: true, nameZh: true } },
          },
        });

        const uniquePersons = new Map<string, { id: string; score: number; name: string }>();
        for (const pf of persons) {
          if (!uniquePersons.has(pf.person.id)) {
            uniquePersons.set(pf.person.id, {
              id: pf.person.id,
              score: pf.person.score,
              name: pf.person.nameZh,
            });
          }
        }

        const memberList = Array.from(uniquePersons.values());
        const avgScore = memberList.length > 0
          ? Math.round(memberList.reduce((s, p) => s + p.score, 0) / memberList.length * 10) / 10
          : 100.0;

        const topPerson = memberList.length > 0
          ? memberList.reduce((a, b) => (a.score > b.score ? a : b))
          : null;

        return {
          slug: `field-${field.slug}`,
          nameZh: field.nameZh,
          nameEn: field.nameEn || field.slug,
          descriptionZh: field.descriptionZh || `${field.nameZh}领域的研究人员群体`,
          descriptionEn: field.descriptionEn || `Research community in ${field.nameEn}`,
          type: 'FIELD',
          memberCount: memberList.length,
          avgScore,
          topPersonId: topPerson?.id || null,
          topPersonName: topPerson?.name || null,
        };
      })
    );

    // ─── 2. Institution circles — aggregate by institution ───
    const institutionCounts = await prisma.person.groupBy({
      by: ['institution'],
      where: { isActive: true, institution: { not: null } },
      _count: { id: true },
      _avg: { score: true },
    });

    const institutionResults = await Promise.all(
      institutionCounts
        .filter((g) => g.institution && g._count.id >= 1)
        .sort((a, b) => b._count.id - a._count.id)
        .map(async (g) => {
          const topPerson = await prisma.person.findFirst({
            where: { institution: g.institution!, isActive: true },
            orderBy: { score: 'desc' },
            select: { id: true, nameZh: true, score: true },
          });

          let instSlug = g.institution!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          // Fallback for non-ASCII institution names (e.g. Chinese) that produce empty slugs
          if (!instSlug || instSlug === '-') instSlug = encodeURIComponent(g.institution!);

          return {
            slug: `institution-${instSlug}`,
            nameZh: g.institution!,
            nameEn: g.institution!,
            descriptionZh: `${g.institution!}的研究人员群体`,
            descriptionEn: `Researchers from ${g.institution!}`,
            type: 'INSTITUTION',
            memberCount: g._count.id,
            avgScore: Math.round((g._avg.score || 100) * 10) / 10,
            topPersonId: topPerson?.id || null,
            topPersonName: topPerson?.nameZh || null,
          };
        })
    );

    // ─── 3. Region circles — aggregate by region ───
    const regionCounts = await prisma.person.groupBy({
      by: ['region'],
      where: { isActive: true, region: { not: null } },
      _count: { id: true },
      _avg: { score: true },
    });

    const regionResults = regionCounts
      .filter((g) => g.region && g._count.id >= 1)
      .sort((a, b) => b._count.id - a._count.id)
      .map(async (g) => {
        const topPerson = await prisma.person.findFirst({
          where: { region: g.region!, isActive: true },
          orderBy: { score: 'desc' },
          select: { id: true, nameZh: true, score: true },
        });

        const regionSlug = g.region!;

        // Map region codes to display names
        const regionNames: Record<string, string> = {
          '华北': '华北', '华东': '华东', '华南': '华南', '华中': '华中',
          '东北': '东北', '西北': '西北', '西南': '西南', '海外': '海外',
        };

        return {
          slug: `region-${regionSlug}`,
          nameZh: regionNames[g.region!] || g.region!,
          nameEn: g.region!,
          descriptionZh: `${regionNames[g.region!] || g.region!}地区的研究人员群体`,
          descriptionEn: `Researchers in ${g.region!} region`,
          type: 'REGION',
          memberCount: g._count.id,
          avgScore: Math.round((g._avg.score || 100) * 10) / 10,
          topPersonId: topPerson?.id || null,
          topPersonName: topPerson?.nameZh || null,
        };
      });

    const regionResultsResolved = await Promise.all(regionResults);

    return Response.json({
      data: {
        fields: fieldResults.filter((f) => f.memberCount > 0),
        institutions: institutionResults,
        regions: regionResultsResolved,
      },
      total: fieldResults.length + institutionResults.length + regionResultsResolved.length,
    });
  } catch (error) {
    console.error('[Circles API] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

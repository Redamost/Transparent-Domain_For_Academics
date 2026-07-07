import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, validationError } from '@/lib/api/errors';
import { HOTSPOT_MIN_REPORTS, HOTSPOT_LOOKBACK_DAYS } from '@/lib/utils/constants';

export type HotspotEventType = 'report' | 'competition' | 'evaluation' | 'research';

export interface HotspotEvent {
  id: string;
  eventType: HotspotEventType;
  /** Main headline — e.g. "3人举报张某学术不端" or "李某获国际数学竞赛金奖" */
  headline: string;
  /** Secondary detail line */
  subtext: string;
  personId: string;
  personName: string;
  personTitle: string | null;
  personInstitution: string | null;
  personScore: number;
  /** 0-10 heat score for sorting */
  heatScore: number;
  publishedAt: string | null;
  /** URL to link to (person page or detail) */
  linkUrl: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'stain';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  if (!['stain', 'highlight'].includes(type)) {
    return validationError('Type must be "stain" or "highlight"');
  }

  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - HOTSPOT_LOOKBACK_DAYS);

  if (type === 'stain') {
    return getStainEvents(lookbackDate, limit);
  }
  return getHighlightEvents(lookbackDate, limit);
}

/** ─── Stain events: individual reports as news items ─── */
async function getStainEvents(lookbackDate: Date, limit: number) {
  // Fetch reports with person info
  const reports = await prisma.report.findMany({
    where: {
      createdAt: { gte: lookbackDate },
      status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      category: true,
      severity: true,
      status: true,
      createdAt: true,
      person: {
        select: {
          id: true,
          nameZh: true,
          nameEn: true,
          title: true,
          institution: true,
          score: true,
        },
      },
    },
  });

  if (reports.length === 0) {
    return apiSuccess({ data: [], total: 0, type: 'stain' });
  }

  // Count reports per person for heat calculation
  const reportCountByPerson = new Map<string, number>();
  for (const r of reports) {
    reportCountByPerson.set(r.person.id, (reportCountByPerson.get(r.person.id) || 0) + 1);
  }

  // Only include persons with >= MIN_REPORTS
  const qualifiedPersonIds = new Set(
    Array.from(reportCountByPerson.entries())
      .filter(([_, count]) => count >= HOTSPOT_MIN_REPORTS)
      .map(([id]) => id)
  );

  // Build events
  const events: HotspotEvent[] = [];

  for (const r of reports) {
    if (!qualifiedPersonIds.has(r.person.id)) continue;

    const p = r.person;
    const reportCount = reportCountByPerson.get(p.id) || 0;

    // Heat score: report count density + severity + recency + approved bonus
    const countScore = Math.min(1, reportCount / 10) * 4;      // 0-4
    const severityScore = ((r.severity || 1) / 5) * 3;          // 0-3
    const daysAgo = Math.max(0, (Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = Math.max(0, 1 - daysAgo / HOTSPOT_LOOKBACK_DAYS) * 2; // 0-2
    const approvedBonus = r.status === 'APPROVED' ? 1 : 0;      // 0-1
    const heatScore = Math.round((countScore + severityScore + recencyScore + approvedBonus) * 100) / 100;

    const categoryLabels: Record<string, string> = {
      ACADEMIC_MISCONDUCT: '学术不端',
      RIGOROUS_RESEARCH: '严谨研究',
      CONFLICT_OF_INTEREST: '利益冲突',
      CITATION_MANIPULATION: '引用操纵',
      OTHER: '其他',
    };

    const statusLabels: Record<string, string> = {
      PENDING: '待审核',
      UNDER_REVIEW: '审核中',
      APPROVED: '已通过',
    };

    events.push({
      id: r.id,
      eventType: 'report',
      headline: `${reportCount}人举报${p.nameZh}`,
      subtext: `${categoryLabels[r.category] || r.category} · 严重度 ${r.severity}/5 · ${statusLabels[r.status] || r.status}`,
      personId: p.id,
      personName: p.nameZh,
      personTitle: p.title,
      personInstitution: p.institution,
      personScore: p.score,
      heatScore,
      publishedAt: r.createdAt.toISOString(),
      linkUrl: `/person/${p.id}`,
    });
  }

  // Sort by heat and deduplicate person-events (show at most 2 events per person)
  events.sort((a, b) => b.heatScore - a.heatScore);

  const seen = new Map<string, number>();
  const deduped = events.filter((e) => {
    const count = seen.get(e.personId) || 0;
    if (count >= 2) return false;
    seen.set(e.personId, count + 1);
    return true;
  });

  const sliced = deduped.slice(0, limit);
  return apiSuccess({ data: sliced, total: sliced.length, type: 'stain' });
}

/** ─── Highlight events: competitions, evaluations, research as news items ─── */
async function getHighlightEvents(lookbackDate: Date, limit: number) {
  // Fetch recent competitions, evaluations, and research for high-score persons
  const [competitions, evaluations, researches] = await Promise.all([
    prisma.competitionUpdate.findMany({
      where: { publishedAt: { gte: lookbackDate } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        level: true,
        award: true,
        publishedAt: true,
        person: {
          select: {
            id: true,
            nameZh: true,
            nameEn: true,
            title: true,
            institution: true,
            score: true,
          },
        },
      },
    }),
    prisma.evaluationUpdate.findMany({
      where: { publishedAt: { gte: lookbackDate } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        evalType: true,
        result: true,
        publishedAt: true,
        person: {
          select: {
            id: true,
            nameZh: true,
            nameEn: true,
            title: true,
            institution: true,
            score: true,
          },
        },
      },
    }),
    prisma.researchUpdate.findMany({
      where: { publishedAt: { gte: lookbackDate } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        source: true,
        publishedAt: true,
        person: {
          select: {
            id: true,
            nameZh: true,
            nameEn: true,
            title: true,
            institution: true,
            score: true,
          },
        },
      },
    }),
  ]);

  const allEvents: HotspotEvent[] = [];

  // Competition events
  for (const c of competitions) {
    const p = c.person;
    const daysAgo = c.publishedAt
      ? Math.max(0, (Date.now() - new Date(c.publishedAt).getTime()) / (1000 * 60 * 60 * 24))
      : HOTSPOT_LOOKBACK_DAYS;
    const recencyScore = Math.max(0, 1 - daysAgo / HOTSPOT_LOOKBACK_DAYS) * 5;

    // Level bonus
    const levelBonus = c.level === '国际级' ? 3 : c.level === '国家级' ? 2 : c.level === '省部级' ? 1 : 0;
    const scoreBonus = Math.min(3, Math.max(0, (p.score - 90) / 20)); // 0-3

    const heatScore = Math.round((recencyScore + levelBonus + scoreBonus) * 100) / 100;

    allEvents.push({
      id: c.id,
      eventType: 'competition',
      headline: `${p.nameZh}${c.award ? `获${c.award}` : '获奖'}`,
      subtext: `竞赛 · ${c.level || '未知级别'} · ${c.title}`,
      personId: p.id,
      personName: p.nameZh,
      personTitle: p.title,
      personInstitution: p.institution,
      personScore: p.score,
      heatScore,
      publishedAt: c.publishedAt?.toISOString() || null,
      linkUrl: `/person/${p.id}`,
    });
  }

  // Evaluation events
  for (const e of evaluations) {
    const p = e.person;
    const daysAgo = e.publishedAt
      ? Math.max(0, (Date.now() - new Date(e.publishedAt).getTime()) / (1000 * 60 * 60 * 24))
      : HOTSPOT_LOOKBACK_DAYS;
    const recencyScore = Math.max(0, 1 - daysAgo / HOTSPOT_LOOKBACK_DAYS) * 5;
    const scoreBonus = Math.min(3, Math.max(0, (p.score - 90) / 20));
    const heatScore = Math.round((recencyScore + scoreBonus + 1) * 100) / 100;

    allEvents.push({
      id: e.id,
      eventType: 'evaluation',
      headline: `${p.nameZh}获评${e.result || e.evalType || '荣誉'}`,
      subtext: `评比 · ${e.evalType || '学术荣誉'} · ${e.title}`,
      personId: p.id,
      personName: p.nameZh,
      personTitle: p.title,
      personInstitution: p.institution,
      personScore: p.score,
      heatScore,
      publishedAt: e.publishedAt?.toISOString() || null,
      linkUrl: `/person/${p.id}`,
    });
  }

  // Research events
  for (const r of researches) {
    const p = r.person;
    const daysAgo = r.publishedAt
      ? Math.max(0, (Date.now() - new Date(r.publishedAt).getTime()) / (1000 * 60 * 60 * 24))
      : HOTSPOT_LOOKBACK_DAYS;
    const recencyScore = Math.max(0, 1 - daysAgo / HOTSPOT_LOOKBACK_DAYS) * 5;
    const scoreBonus = Math.min(3, Math.max(0, (p.score - 90) / 20));
    const heatScore = Math.round((recencyScore + scoreBonus + 0.5) * 100) / 100;

    allEvents.push({
      id: r.id,
      eventType: 'research',
      headline: `${p.nameZh}发表新论文`,
      subtext: `论文 · ${r.source || '未知来源'} · ${r.title}`,
      personId: p.id,
      personName: p.nameZh,
      personTitle: p.title,
      personInstitution: p.institution,
      personScore: p.score,
      heatScore,
      publishedAt: r.publishedAt?.toISOString() || null,
      linkUrl: `/person/${p.id}`,
    });
  }

  // Sort by heat score descending
  allEvents.sort((a, b) => b.heatScore - a.heatScore);

  // Deduplicate: max 2 events per person so the list isn't dominated by one person
  const seen = new Map<string, number>();
  const deduped = allEvents.filter((e) => {
    const count = seen.get(e.personId) || 0;
    if (count >= 2) return false;
    seen.set(e.personId, count + 1);
    return true;
  });

  const sliced = deduped.slice(0, limit);
  return apiSuccess({ data: sliced, total: sliced.length, type: 'highlight' });
}

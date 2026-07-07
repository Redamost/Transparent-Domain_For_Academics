'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@/lib/i18n/navigation';

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
  topPersonName: string | null;
  topPersonId: string | null;
  members: CircleMember[];
  scoreDistribution: { range: string; count: number }[];
  topInstitutions: { institution: string; count: number }[];
}

async function fetchCircle(slug: string): Promise<{ data: CircleDetail }> {
  const res = await fetch(`/api/circles/${slug}`);
  if (!res.ok) throw new Error('Not found');
  return res.json();
}

function getScoreColor(score: number): string {
  if (score >= 110) return 'text-emerald-400';
  if (score >= 100) return 'text-blue-400';
  if (score >= 85) return 'text-amber-400';
  if (score >= 70) return 'text-orange-400';
  return 'text-red-400';
}

const TYPE_LABELS: Record<string, string> = {
  FIELD: '领域',
  INSTITUTION: '机构',
  REGION: '地域',
};

export default function CircleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ['circle', slug],
    queryFn: () => fetchCircle(slug),
  });

  const circle = data?.data;

  if (isLoading) {
    return (
      <div className="min-h-screen home-bg relative">
        <div className="fixed inset-0 noise-bg pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/[0.06] rounded w-64" />
            <div className="h-4 bg-white/[0.04] rounded w-96" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-white/[0.04] rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !circle) {
    return (
      <div className="min-h-screen home-bg relative flex items-center justify-center">
        <div className="fixed inset-0 noise-bg pointer-events-none" />
        <div className="relative z-10 text-center">
          <h1 className="text-2xl font-bold text-white/60 mb-2">404</h1>
          <p className="text-white/25 mb-4">学术圈未找到</p>
          <Link href="/circles" className="text-sm text-blue-400 hover:text-blue-300">
            ← 返回学术圈列表
          </Link>
        </div>
      </div>
    );
  }

  const sortedMembers = [...circle.members].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen home-bg relative">
      <div className="fixed inset-0 noise-bg pointer-events-none" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Link href="/circles" className="text-sm text-white/30 hover:text-white/50 transition-colors mb-2 inline-block">
          ← 学术圈
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1
              className="text-2xl sm:text-3xl font-bold text-white/90"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >
              {circle.nameZh}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-white/[0.04] text-white/30 border-white/[0.08]">
              {TYPE_LABELS[circle.type] || circle.type}
            </span>
          </div>
          <p className="text-white/30 text-sm">{circle.descriptionZh}</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5">
            <div className="text-3xl font-bold text-white/80 tabular-nums leading-none"
              style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
              {circle.memberCount}
            </div>
            <div className="text-xs text-white/25 mt-1">成员数</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5">
            <div className="text-3xl font-bold text-white/80 tabular-nums leading-none"
              style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
              {circle.avgScore.toFixed(1)}
            </div>
            <div className="text-xs text-white/25 mt-1">平均评分</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4 md:col-span-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs text-white/25">评分分布</span>
            </div>
            <div className="flex gap-1">
              {circle.scoreDistribution.map((d) => {
                const pct = circle.memberCount > 0 ? (d.count / circle.memberCount * 100) : 0;
                return (
                  <div key={d.range} className="flex-1" title={`${d.range}: ${d.count}人`}>
                    <div className="text-[10px] text-white/25 text-center mb-0.5" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{d.count}</div>
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full bg-white/20 rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <div className="text-[8px] text-white/15 text-center mt-0.5">{d.range}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Member Rankings */}
          <div className="lg:col-span-2">
            <h2
              className="font-semibold text-white/70 mb-4"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >
              成员排名
            </h2>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm overflow-hidden">
              {sortedMembers.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-3 px-4 text-white/25 font-normal text-xs w-12">#</th>
                      <th className="text-left py-3 px-4 text-white/25 font-normal text-xs">姓名</th>
                      <th className="text-left py-3 px-4 text-white/25 font-normal text-xs hidden sm:table-cell">机构</th>
                      <th className="text-right py-3 px-4 text-white/25 font-normal text-xs w-20">评分</th>
                      <th className="text-right py-3 px-4 text-white/25 font-normal text-xs w-16 hidden md:table-cell">H指数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {sortedMembers.map((member, idx) => (
                      <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4">
                          {idx < 3 ? (
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              idx === 0 ? 'bg-amber-400/15 text-amber-400' :
                              idx === 1 ? 'bg-white/[0.08] text-white/50' :
                              'bg-amber-600/15 text-amber-600/80'
                            }`} style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{idx + 1}</span>
                          ) : (
                            <span className="text-white/20 pl-1.5" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Link href={`/person/${member.id}`} className="text-white/80 hover:text-white/90 font-medium">
                            {member.nameZh}
                          </Link>
                          {member.title && (
                            <div className="text-xs text-white/20 mt-0.5">{member.title}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 hidden sm:table-cell">
                          <span className="text-xs text-white/30">{member.institution}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-bold tabular-nums text-base ${getScoreColor(member.score)}`}
                            style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
                            {member.score.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right hidden md:table-cell">
                          <span className="text-white/30 tabular-nums text-base" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{member.hIndex || '-'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-white/25">暂无成员</div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Top Institutions */}
            {circle.topInstitutions.length > 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5">
                <h3 className="text-sm font-medium text-white/60 mb-3"
                  style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}>
                  主要机构
                </h3>
                <ul className="space-y-2">
                  {circle.topInstitutions.map((inst) => (
                    <li key={inst.institution} className="flex items-center justify-between text-sm">
                      <span className="text-white/50">{inst.institution}</span>
                      <span className="text-white/20 text-xs">{inst.count}人</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top Person Card */}
            {circle.topPersonName && circle.topPersonId && (
              <Link href={`/person/${circle.topPersonId}`}
                className="block rounded-xl border border-amber-400/10 bg-amber-400/[0.03] backdrop-blur-sm p-5 hover:border-amber-400/20 transition-all">
                <div className="text-xs text-amber-400/60 mb-1">最高分</div>
                <div className="text-lg font-bold text-white/85 mb-1">{circle.topPersonName}</div>
                <svg className="w-4 h-4 text-white/20 mt-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

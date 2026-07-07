'use client';

import { Link } from '@/lib/i18n/navigation';

interface CircleCardProps {
  slug: string;
  nameZh: string;
  nameEn: string;
  type: string;
  memberCount: number;
  avgScore: number;
  topPersonName: string | null;
  topPersonId: string | null;
}

const TYPE_COLORS: Record<string, { badge: string; border: string; glow: string }> = {
  FIELD: {
    badge: 'bg-blue-400/10 text-blue-400/80 border-blue-400/20',
    border: 'border-white/[0.06] hover:border-blue-400/30',
    glow: 'bg-blue-400/5',
  },
  INSTITUTION: {
    badge: 'bg-amber-400/10 text-amber-400/80 border-amber-400/20',
    border: 'border-white/[0.06] hover:border-amber-400/30',
    glow: 'bg-amber-400/5',
  },
  REGION: {
    badge: 'bg-emerald-400/10 text-emerald-400/80 border-emerald-400/20',
    border: 'border-white/[0.06] hover:border-emerald-400/30',
    glow: 'bg-emerald-400/5',
  },
};

const TYPE_LABELS: Record<string, string> = {
  FIELD: '按领域',
  INSTITUTION: '按机构',
  REGION: '按地域',
};

export function CircleCard({ slug, nameZh, nameEn, type, memberCount, avgScore, topPersonName, topPersonId }: CircleCardProps) {
  const colors = TYPE_COLORS[type] || TYPE_COLORS.FIELD;

  return (
    <Link
      href={`/circles/${slug}`}
      className={`group relative block rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] bg-white/[0.04] border ${colors.border} shadow-none hover:shadow-lg hover:shadow-black/10`}
    >
      <div className={`absolute inset-0 ${colors.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="relative p-6">
        {/* Type Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${colors.badge}`}>
            {TYPE_LABELS[type] || type}
          </span>
        </div>

        {/* Name */}
        <h3
          className="font-medium text-white/80 group-hover:text-white transition-colors text-lg mb-1"
          style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif', fontWeight: 300 }}
        >
          {nameZh}
        </h3>
        <p className="text-sm text-white/25 mb-4">{nameEn}</p>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-3">
          <div>
            <div className="text-lg text-white/70 tabular-nums"
              style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
              {memberCount}
            </div>
            <div className="text-[10px] text-white/25">成员</div>
          </div>
          <div>
            <div className="text-lg text-white/70 tabular-nums"
              style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
              {avgScore.toFixed(1)}
            </div>
            <div className="text-[10px] text-white/25">平均分</div>
          </div>
        </div>

        {/* Top Person */}
        {topPersonName && (
          <div className="flex items-center gap-1.5 text-xs text-white/25 mt-2 pt-3 border-t border-white/[0.05]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            最高分: <span className="text-white/40">{topPersonName}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

'use client';

import { Link } from '@/lib/i18n/navigation';
import { getScoreColor } from '@/lib/utils/constants';

interface Researcher {
  id: string;
  nameZh: string;
  nameEn: string | null;
  title: string | null;
  institution: string | null;
  avatarUrl: string | null;
  score: number;
  hIndex: number | null;
  citationCount: number | null;
  primaryFields: Array<{ slug: string; nameZh: string; nameEn: string | null }>;
}

type ThemeVariant = 'gold' | 'red';

interface TopResearchersProps {
  researchers: Researcher[];
  variant?: ThemeVariant;
  sectionTitle?: string;
  dark?: boolean;
  columns?: 2 | 3;
}

// ─── Light Theme Map ───
const LIGHT_THEME: Record<ThemeVariant, {
  accent: string;
  rankHighlight: string;
  rankDefault: string;
  tags: string;
  hoverBorder: string;
  titleColor: string;
  cardBorder: string;
  cardBg: string;
  nameColor: string;
  nameEnColor: string;
  institutionColor: string;
  dividerColor: string;
  scoreLabelColor: string;
  rankBoxBg: string;
  rankBoxBorder: string;
  hIndexColor: string;
  hIndexStrongColor: string;
  shadow: string;
  emptyBorder: string;
  emptyBg: string;
  emptyText: string;
  emptyDotBg: string;
  emptyDotBorder: string;
}> = {
  gold: {
    accent: 'bg-amber-500/10',
    rankHighlight: 'text-amber-500/70',
    rankDefault: 'text-neutral-400',
    tags: 'text-amber-600/60 bg-amber-50/50 border-amber-100/50',
    hoverBorder: 'hover:border-amber-200/60',
    titleColor: 'text-neutral-700',
    cardBorder: 'border-neutral-100',
    cardBg: 'bg-white',
    nameColor: 'text-neutral-800',
    nameEnColor: 'text-neutral-400',
    institutionColor: 'text-neutral-300',
    dividerColor: 'border-neutral-100',
    scoreLabelColor: 'text-neutral-300',
    rankBoxBg: 'bg-neutral-50',
    rankBoxBorder: 'border-neutral-100',
    hIndexColor: 'text-neutral-400',
    hIndexStrongColor: 'text-neutral-600',
    shadow: 'shadow-sm hover:shadow-md',
    emptyBorder: 'border-neutral-100',
    emptyBg: 'bg-white',
    emptyText: 'text-neutral-400',
    emptyDotBg: 'bg-neutral-300',
    emptyDotBorder: 'border-neutral-200',
  },
  red: {
    accent: 'bg-red-500/10',
    rankHighlight: 'text-red-500/70',
    rankDefault: 'text-neutral-400',
    tags: 'text-red-600/60 bg-red-50/50 border-red-100/50',
    hoverBorder: 'hover:border-red-200/60',
    titleColor: 'text-neutral-600',
    cardBorder: 'border-neutral-100',
    cardBg: 'bg-white',
    nameColor: 'text-neutral-800',
    nameEnColor: 'text-neutral-400',
    institutionColor: 'text-neutral-300',
    dividerColor: 'border-neutral-100',
    scoreLabelColor: 'text-neutral-300',
    rankBoxBg: 'bg-neutral-50',
    rankBoxBorder: 'border-neutral-100',
    hIndexColor: 'text-neutral-400',
    hIndexStrongColor: 'text-neutral-600',
    shadow: 'shadow-sm hover:shadow-md',
    emptyBorder: 'border-neutral-100',
    emptyBg: 'bg-white',
    emptyText: 'text-neutral-400',
    emptyDotBg: 'bg-neutral-300',
    emptyDotBorder: 'border-neutral-200',
  },
};

// ─── Dark Theme Map ───
const DARK_THEME: Record<ThemeVariant, typeof LIGHT_THEME.gold> = {
  gold: {
    accent: 'bg-amber-400/15',
    rankHighlight: 'text-amber-400/70',
    rankDefault: 'text-white/25',
    tags: 'text-amber-400/60 bg-amber-400/5 border-amber-400/15',
    hoverBorder: 'hover:border-amber-400/25',
    titleColor: 'text-white/80',
    cardBorder: 'border-white/[0.06]',
    cardBg: 'bg-white/[0.03]',
    nameColor: 'text-white/85',
    nameEnColor: 'text-white/35',
    institutionColor: 'text-white/25',
    dividerColor: 'border-white/[0.06]',
    scoreLabelColor: 'text-white/25',
    rankBoxBg: 'bg-white/[0.04]',
    rankBoxBorder: 'border-white/[0.08]',
    hIndexColor: 'text-white/35',
    hIndexStrongColor: 'text-white/60',
    shadow: 'shadow-none',
    emptyBorder: 'border-white/[0.06]',
    emptyBg: 'bg-white/[0.02]',
    emptyText: 'text-white/25',
    emptyDotBg: 'bg-white/[0.08]',
    emptyDotBorder: 'border-white/[0.08]',
  },
  red: {
    accent: 'bg-red-400/15',
    rankHighlight: 'text-red-400/70',
    rankDefault: 'text-white/25',
    tags: 'text-red-400/60 bg-red-400/5 border-red-400/15',
    hoverBorder: 'hover:border-red-400/25',
    titleColor: 'text-white/80',
    cardBorder: 'border-white/[0.06]',
    cardBg: 'bg-white/[0.03]',
    nameColor: 'text-white/85',
    nameEnColor: 'text-white/35',
    institutionColor: 'text-white/25',
    dividerColor: 'border-white/[0.06]',
    scoreLabelColor: 'text-white/25',
    rankBoxBg: 'bg-white/[0.04]',
    rankBoxBorder: 'border-white/[0.08]',
    hIndexColor: 'text-white/35',
    hIndexStrongColor: 'text-white/60',
    shadow: 'shadow-none',
    emptyBorder: 'border-white/[0.06]',
    emptyBg: 'bg-white/[0.02]',
    emptyText: 'text-white/25',
    emptyDotBg: 'bg-white/[0.08]',
    emptyDotBorder: 'border-white/[0.08]',
  },
};

export function TopResearchers({
  researchers,
  variant = 'gold',
  sectionTitle = '高分研究者',
  dark = false,
  columns = 3,
}: TopResearchersProps) {
  const hasResearchers = researchers && researchers.length > 0;
  const t = dark ? DARK_THEME[variant] : LIGHT_THEME[variant];

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className={`w-1 h-8 ${t.accent} rounded-full`} />
          <h2
            className={`text-xl sm:text-2xl ${t.titleColor} tracking-[0.15em]`}
            style={{
              fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
              fontWeight: 200,
            }}
          >
            {sectionTitle}
          </h2>
          <div className="flex-1" />
        </div>

        {hasResearchers ? (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''} gap-3`}>
            {researchers.map((person, index) => {
              const scoreColor = dark ? 'text-white/80' : getScoreColor(person.score);
              const rank = index + 1;

              return (
                <Link
                  key={person.id}
                  href={`/person/${person.id}`}
                  className={`group relative block rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] ${t.cardBg} border ${t.cardBorder} ${t.hoverBorder} ${t.shadow}`}
                >
                  <div className="relative p-5">
                    <div className="flex items-start gap-3">
                      {/* Rank */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${t.rankBoxBg} border ${t.rankBoxBorder} flex items-center justify-center`}>
                        <span
                          className={`text-xs ${rank <= 3 ? t.rankHighlight : t.rankDefault}`}
                          style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}
                        >
                          #{rank}
                        </span>
                      </div>

                      {/* Avatar */}
                      <div className="flex-shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-100 flex items-center justify-center text-neutral-600 font-bold text-base overflow-hidden border border-neutral-200">
                        {person.avatarUrl ? (
                          <img src={person.avatarUrl} alt={person.nameZh} className="w-full h-full object-cover" />
                        ) : (
                          (person.nameEn || person.nameZh).charAt(0).toUpperCase()
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`font-medium ${t.nameColor} group-hover:text-white/90 transition-colors truncate`}
                          style={{
                            fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                            fontWeight: 300,
                          }}
                        >
                          {person.nameZh}
                        </h3>
                        {person.nameEn && (
                          <p className={`text-sm ${t.nameEnColor} truncate`}>{person.nameEn}</p>
                        )}
                        {person.institution && (
                          <p className={`text-xs ${t.institutionColor} truncate mt-1`}>{person.institution}</p>
                        )}
                      </div>

                      {/* Score */}
                      <div className={`text-right flex-shrink-0`}>
                        <div
                          className={`text-2xl ${scoreColor} leading-none`}
                          style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}
                        >
                          {person.score.toFixed(0)}
                        </div>
                        <div className={`text-[10px] ${t.scoreLabelColor} mt-0.5`}>评分</div>
                      </div>
                    </div>

                    {/* Fields & Metrics */}
                    <div className={`mt-3 pt-3 border-t ${t.dividerColor} flex items-center justify-between`}>
                      <div className="flex flex-wrap gap-1.5">
                        {person.primaryFields.slice(0, 2).map((f) => (
                          <span
                            key={f.slug}
                            className={`text-[11px] ${t.tags} px-1.5 py-0.5 rounded border`}
                          >
                            {f.nameZh}
                          </span>
                        ))}
                      </div>
                      <div className={`flex gap-3 text-sm ${t.hIndexColor}`}>
                        {person.hIndex !== null && (
                          <span>
                            H指数{' '}
                            <strong
                              className={`font-semibold ${t.hIndexStrongColor}`}
                              style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}
                            >
                              {person.hIndex}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className={`inline-flex flex-col items-center gap-3 px-8 py-6 rounded-2xl border ${t.emptyBorder} ${t.emptyBg} shadow-sm`}>
              <div className={`w-8 h-8 rounded-full border ${t.emptyDotBorder} flex items-center justify-center`}>
                <div className={`w-1.5 h-1.5 rounded-full ${t.emptyDotBg}`} />
              </div>
              <p className={`text-sm ${t.emptyText}`}>暂无研究者数据</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

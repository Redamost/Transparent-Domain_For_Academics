'use client';

import { useTranslations } from 'next-intl';
import { getScoreColor, SCORE_COLOR_VALUES } from '@/lib/utils/constants';
import { Tooltip } from '@/components/ui/Tooltip';
import { useQuery } from '@tanstack/react-query';

interface FloatingScoreProps {
  score: number;
  personId: string;
  scoreUpdatedAt: string;
}

async function fetchScoreBreakdown(personId: string) {
  const res = await fetch(`/api/persons/${personId}/rating`);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export function FloatingScore({ score, personId, scoreUpdatedAt }: FloatingScoreProps) {
  const t = useTranslations('rating');
  const scoreColor = getScoreColor(score);
  const scoreColorHex = SCORE_COLOR_VALUES[scoreColor] || '#ffffff';

  const { data: breakdown } = useQuery({
    queryKey: ['scoreBreakdown', personId],
    queryFn: () => fetchScoreBreakdown(personId),
    enabled: false, // Only fetch on expand in full version
  });

  // Score gauge calculation (0-180 degree arc, 50-150 score range)
  const minScore = 50;
  const maxScore = 150;
  const clampedScore = Math.max(minScore, Math.min(maxScore, score));
  const percentage = ((clampedScore - minScore) / (maxScore - minScore)) * 100;
  const angle = (percentage / 100) * 270 - 135; // -135 to +135 degrees

  function getScoreLabel(s: number): string {
    if (s > 110) return t('excellent');
    if (s >= 100) return t('good');
    if (s >= 85) return t('fair');
    if (s >= 70) return t('poor');
    return t('critical');
  }

  return (
    <div className="space-y-4">
      {/* Desktop: Sticky Sidebar */}
      <div className="hidden lg:block sticky top-24 rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
        <div className="p-6 text-center">
          <h3
            className="text-sm font-medium text-white/40 mb-4 tracking-wider uppercase"
            style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif', fontWeight: 300 }}
          >{t('score')}</h3>

          {/* Score Gauge */}
          <div className="relative w-40 h-20 mx-auto mb-4 overflow-hidden">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full border-[16px] border-white/[0.06]"
              style={{
                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
              }}
            />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full border-[16px] border-transparent"
              style={{
                borderTopColor: scoreColorHex,
                borderRightColor: scoreColorHex,
                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
                transform: `rotate(${Math.min(angle + 135, 270) - 135}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.5s ease-out',
              }}
            />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
              <div className={`text-3xl font-bold ${scoreColor}`} style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{Math.round(score)}</div>
            </div>
          </div>

          <div className={`text-sm font-medium ${scoreColor} mb-2`}>
            {getScoreLabel(score)}
          </div>

          {/* Baseline Reference */}
          <div className="text-xs text-white/25 mb-4">
            {t('baseline')}
          </div>

          {/* Category Mini Breakdown */}
          <div className="space-y-1.5 text-left">
            {[
              'RESEARCH_QUALITY',
              'METHODOLOGY_RIGOR',
              'COLLABORATION_ETHICS',
              'CITATION_INTEGRITY',
              'PEER_RECOGNITION',
              'COMMUNITY_FEEDBACK',
            ].map((key) => (
              <Tooltip key={key} content={t(`category.${key}`)}>
                <div className="flex items-center justify-between text-xs cursor-help">
                  <span className="text-white/35">{t(`category.${key}`)}</span>
                  <span className="text-white/50 font-mono">100</span>
                </div>
              </Tooltip>
            ))}
          </div>

          <div className="mt-3 text-xs text-white/20">
            {new Date(scoreUpdatedAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Mobile: Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-xs text-white/35">{t('score')}</span>
          <div className={`text-xl font-bold ${scoreColor}`} style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{Math.round(score)}</div>
        </div>
        <div className={`text-xs font-medium ${scoreColor}`}>{getScoreLabel(score)}</div>
        <button className="px-3 py-1 text-xs rounded-full bg-white/[0.06] text-white/50 border border-white/[0.08]">
          Details →
        </button>
      </div>
    </div>
  );
}

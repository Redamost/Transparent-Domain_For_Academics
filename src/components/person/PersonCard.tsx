import { Link } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui';
import { getScoreColor } from '@/lib/utils/constants';
import type { PersonSummary } from '@/types';

export function PersonCard({ person }: { person: PersonSummary }) {
  const t = useTranslations('person');
  const scoreColor = getScoreColor(person.score);

  // Determine data completeness for subtle indicator
  const filledCount = [
    person.title,
    person.institution,
    person.hIndex,
    person.citationCount,
  ].filter(Boolean).length;
  const isBare = filledCount <= 1;

  return (
    <Link href={`/person/${person.id}`}>
      <div className={`rounded-xl border bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300 cursor-pointer h-full p-5 space-y-3 ${isBare ? 'border-white/[0.04]' : 'border-white/[0.08]'}`}>
        {/* Header with avatar and score */}
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-white/60 font-bold text-lg overflow-hidden border border-white/[0.08]">
            {person.avatarUrl ? (
              <img src={person.avatarUrl} alt={person.nameZh} className="w-full h-full object-cover" />
            ) : (
              (person.nameEn || person.nameZh).charAt(0).toUpperCase()
            )}
          </div>
          <div className={`text-right ${scoreColor}`}>
            <div className="text-3xl font-bold leading-none" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.score.toFixed(0)}</div>
            <div className="text-[10px] text-white/25 mt-0.5">{t('score')}</div>
          </div>
        </div>

        {/* Name */}
        <div>
          <h3 className="font-semibold text-white/85 line-clamp-1">{person.nameZh}</h3>
          {person.nameEn ? (
            <p className="text-sm text-white/30 line-clamp-1">{person.nameEn}</p>
          ) : (
            <p className="text-sm text-white/10 italic line-clamp-1">{t('unknownNameEn')}</p>
          )}
        </div>

        {/* Title & Institution — always visible with placeholders */}
        <div className="space-y-1">
          <p className="text-sm text-white/40 line-clamp-1">
            {person.title || t('unknownTitle')}
          </p>
          <p className="text-xs text-white/25 line-clamp-1">
            {person.institution || t('unknownInstitution')}
          </p>
        </div>

        {/* Fields — show placeholder if empty */}
        {person.primaryFields.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {person.primaryFields.slice(0, 3).map((f) => (
              <Badge key={f.slug} variant="primary">{f.nameZh}</Badge>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-white/15 italic">{t('unknownField')}</span>
          </div>
        )}

        {/* Metrics — always visible, show empty states */}
        <div className="flex gap-4 text-sm pt-2 border-t border-white/[0.06]">
          <span className="text-white/35">
            {t('hIndex')}{' '}
            {person.hIndex !== null ? (
              <strong className="text-white/60 font-semibold" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.hIndex}</strong>
            ) : (
              <span className="text-white/15">--</span>
            )}
          </span>
          <span className="text-white/35">
            {t('citations')}{' '}
            {person.citationCount !== null ? (
              <strong className="text-white/60 font-semibold" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.citationCount.toLocaleString()}</strong>
            ) : (
              <span className="text-white/15">--</span>
            )}
          </span>
        </div>

        {/* Data completeness indicator for bare profiles */}
        {isBare && (
          <div className="pt-1">
            <span className="text-[10px] text-white/10 italic">{t('dataIncomplete')}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

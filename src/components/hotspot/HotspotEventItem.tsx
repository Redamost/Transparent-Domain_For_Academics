'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import type { HotspotEvent } from '@/app/api/hotspots/route';

interface HotspotEventItemProps {
  event: HotspotEvent;
}

const eventIcons: Record<string, string> = {
  report: '🚩',
  competition: '🏆',
  evaluation: '🎖️',
  research: '📄',
};

export function HotspotEventItem({ event }: HotspotEventItemProps) {
  const t = useTranslations('hotspot');
  const isStain = event.eventType === 'report';

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('justNow');
    if (mins < 60) return t('minutesAgo', { minutes: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('hoursAgo', { hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('daysAgo', { days });
    return t('monthsAgo', { months: Math.floor(days / 30) });
  }

  return (
    <Link
      href={event.linkUrl}
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-all duration-200 group',
        'border-b border-white/[0.04] last:border-b-0',
        'hover:bg-white/[0.03]',
        isStain
          ? 'hover:border-l-2 hover:border-l-red-500/30'
          : 'hover:border-l-2 hover:border-l-emerald-500/30'
      )}
    >
      {/* Event type icon */}
      <span className="flex-shrink-0 text-sm mt-0.5 opacity-70">
        {eventIcons[event.eventType] || '📌'}
      </span>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Headline + heat badge */}
        <div className="flex items-center gap-2">
          <p className="text-sm text-white/80 truncate font-medium leading-snug">
            {event.headline}
          </p>
          {/* Heat score pill */}
          <span
            className={cn(
              'flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium border',
              isStain
                ? 'bg-red-500/8 text-red-400/70 border-red-500/15'
                : 'bg-emerald-500/8 text-emerald-400/70 border-emerald-500/15'
            )}
          >
            {event.heatScore.toFixed(1)}
          </span>
        </div>

        {/* Subtext */}
        <p className="text-xs text-white/30 truncate mt-0.5 leading-relaxed">
          {event.subtext}
        </p>

        {/* Person info line */}
        <p className="text-[11px] text-white/20 truncate mt-0.5">
          {event.personName}
          {event.personTitle && ` · ${event.personTitle}`}
          {event.personInstitution && ` · ${event.personInstitution}`}
          <span className="text-white/15 ml-1">评分 {event.personScore.toFixed(0)}</span>
        </p>
      </div>

      {/* Timestamp */}
      <span className="flex-shrink-0 text-[10px] text-white/20 mt-0.5 whitespace-nowrap">
        {timeAgo(event.publishedAt)}
      </span>
    </Link>
  );
}

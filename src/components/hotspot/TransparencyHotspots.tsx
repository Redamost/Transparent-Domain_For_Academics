'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { HotspotEventItem } from './HotspotEventItem';
import type { HotspotEvent } from '@/app/api/hotspots/route';

interface HotspotResponse {
  data: HotspotEvent[];
  total: number;
  type: 'stain' | 'highlight';
}

async function fetchHotspots(type: 'stain' | 'highlight'): Promise<HotspotResponse> {
  const res = await fetch(`/api/hotspots?type=${type}&limit=20`);
  if (!res.ok) throw new Error('Failed to fetch hotspots');
  return res.json();
}

interface TransparencyHotspotsProps {
  variant?: 'default' | 'compact';
  hideTitle?: boolean;
  fixedTab?: 'stain' | 'highlight';
}

export function TransparencyHotspots({ variant = 'default', hideTitle = false, fixedTab }: TransparencyHotspotsProps) {
  const t = useTranslations('hotspot');
  const [activeTab, setActiveTab] = useState<'stain' | 'highlight'>(fixedTab || 'stain');

  const lastUpdatedRef = useRef<number>(Date.now());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['hotspots', activeTab],
    queryFn: () => fetchHotspots(activeTab),
    staleTime: 60_000,
    refetchInterval: 900_000, // 15 分钟
    refetchOnWindowFocus: true,
  });

  // Track last-updated time: reset on every successful data arrival
  useEffect(() => {
    if (data) {
      lastUpdatedRef.current = Date.now();
      setSecondsSinceUpdate(0);
      const timer = setInterval(() => {
        setSecondsSinceUpdate(Math.floor((Date.now() - lastUpdatedRef.current) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [data]);

  const events = data?.data || [];
  const isCompact = variant === 'compact';

  function formatTimeAgo(seconds: number): string {
    if (seconds < 5) return t('justNow');
    if (seconds < 60) return t('secondsAgo', { seconds });
    if (seconds < 3600) return t('minutesAgo', { minutes: Math.floor(seconds / 60) });
    return t('hoursAgo', { hours: Math.floor(seconds / 3600) });
  }

  return (
    <section className={cn(
      isCompact ? 'py-0' : 'py-16 px-4 sm:px-6 lg:px-8'
    )}>
      <div className={cn(!isCompact && 'max-w-7xl mx-auto')}>
        {/* Section header */}
        {!hideTitle && (
          <div className={cn('mb-6', !isCompact && 'text-center mb-10')}>
            <h2
              className={cn(
                'font-bold text-white/90 mb-2',
                isCompact ? 'text-xl' : 'text-3xl sm:text-4xl mb-3'
              )}
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >
              {t('title')}
            </h2>
            <p className={cn('text-sm text-white/35', isCompact ? 'text-xs max-w-none' : 'max-w-lg mx-auto')}>
              {t('subtitle')}
            </p>
          </div>
        )}

        {/* Tab switcher — hidden when locked to a single tab */}
        {!fixedTab && (
          <div className={cn('flex gap-2', isCompact ? 'justify-start mb-4' : 'justify-center mb-8')}>
            <button
              onClick={() => setActiveTab('stain')}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
                isCompact && 'text-xs px-3 py-1.5',
                activeTab === 'stain'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/35 hover:text-white/60 hover:border-white/[0.12]'
              )}
            >
              {t('tabStains')}
            </button>
            <button
              onClick={() => setActiveTab('highlight')}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
                isCompact && 'text-xs px-3 py-1.5',
                activeTab === 'highlight'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/35 hover:text-white/60 hover:border-white/[0.12]'
              )}
            >
              {t('tabHighlights')}
            </button>
          </div>
        )}

        {/* Live status bar */}
        <div className={cn('flex items-center gap-2', isCompact ? 'pt-3 mb-2 px-3' : 'mb-4 justify-center')}>
          <span className="relative flex h-2 w-2">
            <span className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              activeTab === 'stain' ? 'bg-red-400' : 'bg-emerald-400'
            )} />
            <span className={cn(
              'relative inline-flex rounded-full h-2 w-2',
              isFetching ? (activeTab === 'stain' ? 'bg-red-400' : 'bg-emerald-400') : 'bg-white/20'
            )} />
          </span>
          <span className="text-[11px] text-white/25">
            {isFetching ? t('updating') : t('live')}
          </span>
          <span className="text-[11px] text-white/15">·</span>
          <span className="text-[11px] text-white/20">
            {formatTimeAgo(secondsSinceUpdate)}
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: isCompact ? 4 : 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] animate-pulse"
              >
                <div className="w-4 h-4 rounded-full bg-white/[0.05]" />
                <div className="flex-1">
                  <div className="h-3.5 bg-white/[0.05] rounded w-3/4 mb-1.5" />
                  <div className="h-2.5 bg-white/[0.03] rounded w-1/2" />
                </div>
                <div className="h-2.5 bg-white/[0.03] rounded w-10" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className={cn('text-center', isCompact ? 'py-6' : 'py-16')}>
            <p className="text-sm text-white/25">
              {activeTab === 'stain' ? t('noStains') : t('noHighlights')}
            </p>
          </div>
        ) : (
          <>
            {/* News-feed list */}
            <div className={cn(
              'border border-white/[0.06] rounded-lg overflow-hidden',
              isCompact ? 'bg-transparent border-0' : 'bg-white/[0.01]'
            )}>
              {events.map((event) => (
                <HotspotEventItem key={event.id} event={event} />
              ))}
            </div>
            <p className={cn('text-xs text-white/20', isCompact ? 'text-left mt-2' : 'text-center mt-4')}>
              {t('showingCount', { count: events.length })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

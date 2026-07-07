'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Flame, Target } from 'lucide-react';

interface LevelInfo {
  level: number;
  nameZh: string;
  nameEn: string;
  icon: string;
  color: string;
}

interface LevelProgressProps {
  level: number;
  currentExp: number;
  nextLevelExp: number;
  progress: number; // 0-100
  levelInfo: LevelInfo;
  nextLevelInfo: LevelInfo | null;
  reportAccuracy?: number;
  currentStreak?: number;
  longestStreak?: number;
  totalTasksCompleted?: number;
  totalReportsApproved?: number;
}

export function LevelProgress({
  level,
  currentExp,
  nextLevelExp,
  progress,
  levelInfo,
  nextLevelInfo,
  reportAccuracy = 0,
  currentStreak = 0,
  longestStreak = 0,
  totalTasksCompleted = 0,
  totalReportsApproved = 0,
}: LevelProgressProps) {
  const t = useTranslations('community');

  const accuracyPercent = Math.round(reportAccuracy * 100);
  const accuracyColor =
    accuracyPercent >= 80
      ? 'text-emerald-400'
      : accuracyPercent >= 50
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5">
      {/* Level header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{levelInfo.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="text-lg font-semibold text-white/90"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >
              {levelInfo.nameZh}
            </h3>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border', levelInfo.color, 'bg-current/5')}>
              Lv.{level}
            </span>
          </div>
          <p className="text-xs text-white/30 mt-0.5">
            {nextLevelInfo
              ? `${t('expToNext', { exp: nextLevelExp - currentExp })}`
              : t('maxLevel')}
          </p>
        </div>
      </div>

      {/* EXP Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-white/30">{t('levelProgress')}</span>
          <span className="text-xs text-white/40">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #60a5fa, #34d399, #fbbf24)',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-white/20">{currentExp} EXP</span>
          <span className="text-[10px] text-white/20">{nextLevelExp} EXP</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Accuracy */}
        <div className="text-center">
          <div className={cn('text-lg font-bold', accuracyColor)} style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
            {accuracyPercent}%
          </div>
          <div className="text-[10px] text-white/25 mt-0.5">{t('accuracy')}</div>
        </div>

        {/* Current Streak */}
        <div className="text-center">
          <div className="text-lg font-bold text-orange-400 flex items-center justify-center gap-1" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
            <Flame className="w-4 h-4" />
            {currentStreak}
          </div>
          <div className="text-[10px] text-white/25 mt-0.5">{t('currentStreak')}</div>
        </div>

        {/* Tasks completed */}
        <div className="text-center">
          <div className="text-lg font-bold text-blue-400" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
            {totalTasksCompleted}
          </div>
          <div className="text-[10px] text-white/25 mt-0.5">{t('tasksCompleted')}</div>
        </div>

        {/* Reports Approved */}
        <div className="text-center">
          <div className="text-lg font-bold text-purple-400" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
            {totalReportsApproved}
          </div>
          <div className="text-[10px] text-white/25 mt-0.5">{t('reportsApproved')}</div>
        </div>
      </div>

      {/* Longest streak note */}
      {longestStreak > 0 && (
        <p className="text-[10px] text-white/15 text-center mt-3">
          {t('longestStreak')}: {longestStreak} {t('days')}
        </p>
      )}
    </div>
  );
}

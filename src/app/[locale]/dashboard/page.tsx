'use client';

import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@/lib/i18n/navigation';
import { TaskList } from '@/components/community/TaskList';
import { LevelProgress } from '@/components/community/LevelProgress';

interface CommunityStats {
  totalReports: number;
  approvedReports: number;
  rejectedReports: number;
  scoreImpact: number;
  streak: number;
  longestStreak: number;
  todayTasks: number;
  transparencyLevel: number;
  levelExp: number;
  nextLevelExp: number;
  levelProgress: number;
  levelInfo: { nameZh: string; nameEn: string; icon: string; color: string };
  reportAccuracy: number;
}

async function fetchStats(): Promise<CommunityStats> {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

async function fetchProfile() {
  const res = await fetch('/api/community/profile');
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

async function fetchReports() {
  const res = await fetch('/api/reports?limit=10');
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tCommunity = useTranslations('community');
  const { data: session } = useSession();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: fetchStats,
  });

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['communityProfile'],
    queryFn: fetchProfile,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ['myReports'],
    queryFn: fetchReports,
  });

  const levelInfo = profile || stats;

  return (
    <div className="min-h-screen home-bg relative">
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1
          className="text-2xl font-bold text-white/90 mb-2"
          style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
        >
          {t('welcome')}, {session?.user?.name}
        </h1>
        <p className="text-white/35 mb-8">
          {(session?.user as any)?.role === 'COMMUNITY' ? 'Community Participant' : 'Administrator'}
        </p>

        {/* Level Progress */}
        {levelInfo && levelInfo.levelInfo && (
          <div className="mb-8">
            <LevelProgress
              level={levelInfo.transparencyLevel || levelInfo.level || 1}
              currentExp={levelInfo.levelExp || levelInfo.currentExp || 0}
              nextLevelExp={levelInfo.nextLevelExp || 0}
              progress={levelInfo.levelProgress || levelInfo.progress || 0}
              levelInfo={levelInfo.levelInfo}
              nextLevelInfo={(levelInfo as any).nextLevelInfo || null}
              reportAccuracy={levelInfo.reportAccuracy || 0}
              currentStreak={stats?.streak || 0}
              longestStreak={stats?.longestStreak || 0}
              totalTasksCompleted={(levelInfo as any).totalTasksCompleted || 0}
              totalReportsApproved={
                (levelInfo as any).totalReportsApproved || stats?.approvedReports || 0
              }
            />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[
            { label: t('totalReports'), value: stats?.totalReports || 0, color: 'text-blue-400' },
            { label: t('approvedReports'), value: stats?.approvedReports || 0, color: 'text-emerald-400' },
            { label: t('rejectedReports'), value: stats?.rejectedReports || 0, color: 'text-red-400' },
            { label: t('scoreImpact'), value: stats?.scoreImpact || 0, color: 'text-indigo-400' },
            { label: t('streak'), value: stats?.streak || 0, color: 'text-orange-400' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4 text-center"
            >
              <div className={`text-2xl font-bold ${stat.color}`} style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
                {statsLoading ? '-' : stat.value}
              </div>
              <div className="text-xs text-white/30 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tasks and Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Today Tasks */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
            <div className="p-6">
              <h2
                className="font-semibold text-white/80 mb-4"
                style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
              >{t('todayTasks')}</h2>
              <TaskList />
            </div>
          </div>

          {/* Recent Reports */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="font-semibold text-white/80"
                  style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
                >{t('recentReports')}</h2>
                <Link
                  href="/dashboard/reports"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View All
                </Link>
              </div>
              {reportsLoading ? (
                <p className="text-sm text-white/25 text-center py-8">Loading...</p>
              ) : reports?.data?.length > 0 ? (
                <ul className="divide-y divide-white/[0.06]">
                  {reports.data.slice(0, 5).map((report: any) => (
                    <li key={report.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white/85">{report.title}</p>
                          <p className="text-xs text-white/30">{report.personName} · {new Date(report.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          report.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          report.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          report.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          'bg-white/[0.04] text-white/40 border-white/[0.08]'
                        }`}>
                          {t(`common:report.status_${report.status}`)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-white/25 text-center py-8">No reports yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

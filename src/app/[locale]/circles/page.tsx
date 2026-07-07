'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCard } from '@/components/circles/CircleCard';
import { MouseFollowGlass } from '@/components/effects/MouseFollowGlass';
import { Particles } from '@/components/effects/Particles';

interface CircleData {
  slug: string;
  nameZh: string;
  nameEn: string;
  type: string;
  memberCount: number;
  avgScore: number;
  topPersonName: string | null;
  topPersonId: string | null;
}

interface CirclesResponse {
  data: {
    fields: CircleData[];
    institutions: CircleData[];
    regions: CircleData[];
  };
}

async function fetchCircles(): Promise<CirclesResponse> {
  const res = await fetch('/api/circles');
  if (!res.ok) throw new Error('Failed to fetch circles');
  return res.json();
}

type Tab = 'field' | 'institution' | 'region';

export default function CirclesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['circles'],
    queryFn: fetchCircles,
  });
  const [tab, setTab] = useState<Tab>('field');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'field', label: '按领域' },
    { key: 'institution', label: '按机构' },
    { key: 'region', label: '按地域' },
  ];

  const circles: CircleData[] = tab === 'field'
    ? (data?.data?.fields || [])
    : tab === 'institution'
    ? (data?.data?.institutions || [])
    : (data?.data?.regions || []);

  return (
    <div className="min-h-screen home-bg relative">
      {/* Subtle background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="gradient-orb w-[500px] h-[500px] bg-neutral-700 top-[5%] right-[10%] animate-float-slow"
          style={{ animationDelay: '0s', opacity: 0.08 }}
        />
      </div>
      <div className="fixed inset-0 noise-bg pointer-events-none" />
      <MouseFollowGlass className="fixed inset-0 pointer-events-none z-0" />
      <Particles count={30} color="rgba(255,255,255,0.08)" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl sm:text-3xl font-bold text-white/90 mb-2"
            style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
          >
            学术圈
          </h1>
          <p className="text-white/30 text-sm">以领域、机构、地域三个维度透视学术势力范围</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm transition-all duration-300 border ${
                tab === t.key
                  ? 'bg-white/[0.08] border-white/20 text-white/90'
                  : 'bg-transparent border-white/[0.06] text-white/35 hover:text-white/60 hover:border-white/10'
              }`}
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse h-48 bg-white/[0.04] rounded-2xl" />
            ))}
          </div>
        ) : circles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {circles.map((circle) => (
              <CircleCard key={circle.slug} {...circle} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex flex-col items-center gap-3 px-8 py-6 rounded-2xl border border-white/[0.06] bg-white/[0.03]">
              <div className="w-8 h-8 rounded-full border border-white/[0.08] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white/[0.15]" />
              </div>
              <p className="text-sm text-white/25">暂无数据</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

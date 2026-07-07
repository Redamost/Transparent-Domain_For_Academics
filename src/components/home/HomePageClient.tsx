'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MouseFollowGlass } from '@/components/effects/MouseFollowGlass';
import { Particles } from '@/components/effects/Particles';
import { ScrollReveal } from '@/components/effects/ScrollReveal';
import { PopularFields } from './PopularFields';
import { TopResearchers } from './TopResearchers';
import { StatsSection } from './StatsSection';
import { TransparencyHotspots } from '@/components/hotspot/TransparencyHotspots';

interface HomePageClientProps {
  fields: Array<{
    id: string;
    slug: string;
    nameZh: string;
    nameEn: string;
    level: number;
    children: unknown[];
    _count?: { persons: number };
  }>;
  researchers: Array<{
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
  }>;
  lowScoreResearchers: Array<{
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
  }>;
  totalPersons: number;
  totalFields: number;
}

export function HomePageClient({ fields, researchers, lowScoreResearchers, totalPersons, totalFields }: HomePageClientProps) {
  const tHot = useTranslations('hotspot');
  const tHome = useTranslations('home');

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('scroll-smooth', 'snap-y', 'snap-proximity');
    return () => {
      html.classList.remove('scroll-smooth', 'snap-y', 'snap-proximity');
    };
  }, []);

  return (
    <div className="min-h-screen home-bg relative">
      {/* Subtle background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="gradient-orb w-[600px] h-[600px] bg-neutral-700 top-[10%] left-[5%] animate-float-slow"
          style={{ animationDelay: '0s', opacity: 0.1 }}
        />
        <div
          className="gradient-orb w-[500px] h-[500px] bg-neutral-600 bottom-[20%] right-[10%] animate-float-slow"
          style={{ animationDelay: '4s', opacity: 0.08 }}
        />
      </div>

      {/* Noise overlay */}
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      {/* Cursor glow */}
      <MouseFollowGlass className="fixed inset-0 pointer-events-none z-0" />

      {/* Particles */}
      <Particles count={40} color="rgba(255,255,255,0.12)" />

      {/* Content */}
      <div className="relative z-10">
        {/* Downward particles at top — gentle snowfall effect */}
        <Particles count={30} color="rgba(255,255,255,0.15)" direction="down" />

        {/* Hero + Stats — full viewport page (full width, top-bottom) */}
        <div className="min-h-[calc(100vh-3.5rem)] flex flex-col justify-center relative snap-start">
          {/* Hero Section — dark */}
          <section className="pt-20 sm:pt-28 pb-8 sm:pb-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto text-center">
              {/* Glass sphere — emerges behind title */}
              <div className="relative inline-block">
                <div className="glass-sphere" />
                <h1
                  className="relative text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black mb-6 text-weathered text-weathered-stroke tracking-[0.1em] leading-none animate-fade-in-up"
                  data-text="透明领域"
                  style={{
                    fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", "STSong", "SimSun", serif',
                    animationDelay: '200ms',
                  }}
                >
                  透明领域
                </h1>
              </div>
              <p
                className="text-2xl sm:text-3xl md:text-4xl text-neutral-400/80 max-w-2xl mx-auto leading-relaxed animate-fade-in-up tracking-widest mb-4"
                style={{
                  fontFamily: 'var(--font-zhi-mang-xing), "Zhi Mang Xing", cursive',
                  animationDelay: '300ms',
                }}
              >
                天上有行云，人在行云里。
              </p>
            </div>
          </section>

          {/* Stats Section — dark glass, overlaps tail of title animation */}
          <div className="pt-0 pb-8">
            <ScrollReveal direction="up" threshold={0.15} delay={700}>
              <StatsSection totalPersons={totalPersons} totalFields={totalFields} />
            </ScrollReveal>
          </div>
        </div>

        {/* ─── Two-row layout: each row aligns researchers (left) + hotspots (right) ─── */}
        <div className="snap-start min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Row 1: 高分研究者 | 学术亮点 */}
            <div className="grid grid-cols-1 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ScrollReveal direction="up" threshold={0.1} delay={100}>
                  <TopResearchers
                    researchers={researchers}
                    variant="gold"
                    sectionTitle={tHome('topResearchers')}
                    dark
                    columns={2}
                  />
                </ScrollReveal>
              </div>
              <div className="lg:col-span-1 border-l border-white/[0.06]">
                <ScrollReveal direction="up" threshold={0.1} delay={100}>
                  <div className="pt-12">
                    <div className="flex items-center gap-4 px-4 mb-6">
                      <div className="w-1 h-8 bg-emerald-400/15 rounded-full" />
                      <h2
                        className="text-xl sm:text-2xl text-white/80 tracking-[0.15em]"
                        style={{
                          fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                          fontWeight: 200,
                        }}
                      >
                        {tHot('tabHighlights')}
                      </h2>
                    </div>
                    <div className="backdrop-blur-md bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden mx-3">
                      <TransparencyHotspots variant="compact" hideTitle fixedTab="highlight" />
                    </div>
                  </div>
                </ScrollReveal>
              </div>
            </div>

            {/* Row 2: 低分研究者 | 学术污点 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 -mt-12">
              <div className="lg:col-span-2">
                <ScrollReveal direction="up" threshold={0.1} delay={150}>
                  <TopResearchers
                    researchers={lowScoreResearchers}
                    variant="red"
                    sectionTitle={tHome('lowResearchers')}
                    dark
                    columns={2}
                  />
                </ScrollReveal>
              </div>
              <div className="lg:col-span-1 border-l border-white/[0.06]">
                <ScrollReveal direction="up" threshold={0.1} delay={150}>
                  <div className="pt-12">
                    <div className="flex items-center gap-4 px-4 mb-6">
                      <div className="w-1 h-8 bg-red-400/15 rounded-full" />
                      <h2
                        className="text-xl sm:text-2xl text-white/80 tracking-[0.15em]"
                        style={{
                          fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                          fontWeight: 200,
                        }}
                      >
                        {tHot('tabStains')}
                      </h2>
                    </div>
                    <div className="backdrop-blur-md bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden mx-3">
                      <TransparencyHotspots variant="compact" hideTitle fixedTab="stain" />
                    </div>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </div>
        </div>

        {/* Popular Fields — full width, separate section */}
        <div className="snap-start min-h-screen">
          <ScrollReveal direction="up" threshold={0.1} delay={100}>
            <PopularFields fields={fields} />
          </ScrollReveal>
        </div>

        {/* White particles — float upward from bottom of page */}
        <Particles count={50} color="rgba(255,255,255,0.2)" />
      </div>
    </div>
  );
}

'use client';

import { Link } from '@/lib/i18n/navigation';
import { useCountUp } from '@/hooks/useCountUp';

interface StatsSectionProps {
  totalPersons: number;
  totalFields: number;
}

export function StatsSection({ totalPersons, totalFields }: StatsSectionProps) {
  const { count: personsCount, ref: personsRef } = useCountUp(totalPersons);
  const { count: fieldsCount, ref: fieldsRef } = useCountUp(totalFields);

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stat Card 1 — 收录研究者 */}
          <div
            ref={personsRef}
            className="relative rounded-2xl overflow-hidden p-6 group bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.12]"
          >
            <div className="relative">
              <div
                className="text-4xl text-white/90 mb-2 leading-none tabular-nums"
                style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}
              >
                {personsCount.toLocaleString()}
              </div>
              <div
                className="text-sm text-white/40 tracking-[0.1em]"
                style={{
                  fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                  fontWeight: 200,
                }}
              >
                收录研究者
              </div>
            </div>
          </div>

          {/* Stat Card 2 — 研究领域 */}
          <div
            ref={fieldsRef}
            className="relative rounded-2xl overflow-hidden p-6 group bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.12]"
          >
            <div className="relative">
              <div
                className="text-4xl text-white/90 mb-2 leading-none tabular-nums"
                style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}
              >
                {fieldsCount.toLocaleString()}
              </div>
              <div
                className="text-sm text-white/40 tracking-[0.1em]"
                style={{
                  fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                  fontWeight: 200,
                }}
              >
                研究领域
              </div>
            </div>
          </div>

          {/* CTA Card */}
          <Link
            href="/search"
            className="relative rounded-2xl overflow-hidden p-6 group transition-all duration-500 hover:scale-[1.02] bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] flex items-center"
          >
            <div className="relative flex items-center justify-between w-full">
              <div>
                <div
                  className="text-lg text-white/80 group-hover:text-white transition-colors tracking-wide"
                  style={{
                    fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                    fontWeight: 300,
                  }}
                >
                  探索更多研究者
                </div>
                <div className="text-sm text-white/30 mt-1">
                  使用搜索功能查找特定领域或研究者
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/[0.1] transition-colors">
                <svg className="w-5 h-5 text-white/40 group-hover:text-white/70 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}

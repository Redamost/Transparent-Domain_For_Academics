'use client';

import { useRouter } from '@/lib/i18n/navigation';
import { MouseFollowGlass } from '@/components/effects/MouseFollowGlass';
import { Particles } from '@/components/effects/Particles';
import { useCallback, useState } from 'react';

export function EntrancePage() {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  const handleEnter = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      router.push('/home');
    }, 700);
  }, [router]);

  const baseTransition = exiting
    ? 'opacity-0 translate-y-3 scale-[0.98]'
    : 'opacity-100 translate-y-0 scale-100';

  return (
    <MouseFollowGlass
      className="fixed inset-0 z-50 entrance-bg overflow-hidden"
      enableCursorGlow
    >
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="gradient-orb w-[700px] h-[700px] bg-neutral-600 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-glow-pulse"
          style={{ animationDelay: '0s' }}
        />
        <div
          className="gradient-orb w-[500px] h-[500px] bg-neutral-700 top-[20%] left-[15%] animate-float-slow"
          style={{ animationDelay: '2s', opacity: 0.2 }}
        />
        <div
          className="gradient-orb w-[400px] h-[400px] bg-neutral-500 bottom-[15%] right-[10%] animate-float-slow"
          style={{ animationDelay: '4s', opacity: 0.15 }}
        />
      </div>

      {/* Noise overlay */}
      <div className="absolute inset-0 noise-bg pointer-events-none" />

      {/* Main glass panel */}
      <div
        className={`absolute inset-3 sm:inset-5 lg:inset-8 rounded-3xl overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          exiting ? 'scale-[0.96] opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div className="absolute inset-0 glass-cursor" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent" />

        {/* Particles at bottom */}
        <Particles count={80} color="rgba(255,255,255,0.25)" />

        {/* Click area */}
        <button
          onClick={handleEnter}
          className="absolute inset-0 z-20 cursor-pointer focus:outline-none"
          aria-label="Enter the platform"
        />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 text-center select-none">
          {/* Eyebrow */}
          <div
            className={`inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-white/5 bg-white/[0.03] text-sm text-neutral-400 mb-10 tracking-wider uppercase transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] delay-0 ${baseTransition}`}
            style={{ transitionDelay: exiting ? '0ms' : '100ms' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-pulse-subtle" />
            九天科技解构平台
          </div>

          {/* Main title — 透明领域 */}
          <h1
            className={`text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black mb-4 text-weathered text-weathered-stroke tracking-[0.15em] leading-none transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${baseTransition}`}
            data-text="透明领域"
            style={{
              fontFamily:
                'var(--font-noto-serif-sc), "Noto Serif SC", "STSong", "SimSun", serif',
              transitionDelay: exiting ? '0ms' : '200ms',
            }}
          >
            透明领域
          </h1>

          {/* Subtitle — 行楷 */}
          <p
            className={`text-xl sm:text-2xl md:text-3xl text-neutral-400/80 mb-16 tracking-widest transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${baseTransition}`}
            style={{
              fontFamily: 'var(--font-zhi-mang-xing), "Zhi Mang Xing", cursive',
              transitionDelay: exiting ? '0ms' : '350ms',
            }}
          >
            天上有行云，人在行云里。
          </p>

          {/* Enter hint — icon only */}
          <div
            className={`flex flex-col items-center gap-3 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${baseTransition}`}
            style={{ transitionDelay: exiting ? '0ms' : '500ms' }}
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-full border border-white/15 flex items-center justify-center bg-white/[0.03] backdrop-blur-sm animate-breathe">
                <svg
                  className="w-5 h-5 text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                  />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full border border-white/10 animate-[ripple_3s_ease-out_infinite]" />
              <div className="absolute inset-0 rounded-full border border-white/10 animate-[ripple_3s_ease-out_infinite_1s]" />
            </div>
          </div>
        </div>

        {/* Bottom corner accents */}
        <div className="absolute bottom-6 left-6 sm:bottom-10 sm:left-10 text-[10px] text-neutral-700 tracking-widest uppercase">
          Jiutian Tech Deconstruction
        </div>
        <div className="absolute bottom-6 right-6 sm:bottom-10 sm:right-10 text-[10px] text-neutral-700 tracking-widest uppercase">
          Est. 2024
        </div>
      </div>
    </MouseFollowGlass>
  );
}

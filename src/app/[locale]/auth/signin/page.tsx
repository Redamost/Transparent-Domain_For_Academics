'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui';
import { Link } from '@/lib/i18n/navigation';

export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      router.push(`/${locale}`);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen home-bg relative flex items-center justify-center px-4 py-12">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="gradient-orb w-[500px] h-[500px] bg-neutral-700 top-[20%] left-[10%] animate-float-slow"
          style={{ opacity: 0.08 }}
        />
        <div
          className="gradient-orb w-[400px] h-[400px] bg-neutral-600 bottom-[20%] right-[15%] animate-float-slow"
          style={{ opacity: 0.06, animationDelay: '3s' }}
        />
      </div>
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2.5 group mb-6">
            <div className="w-8 h-8 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:border-white/20">
              <svg className="w-5 h-5 text-white" viewBox="0 0 512 512" fill="currentColor">
                <polygon points="256,100 100,400 412,400" />
              </svg>
            </div>
            <span
              className="text-sm text-white/80 tracking-wide transition-colors group-hover:text-white/90"
              style={{
                fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                fontWeight: 300,
              }}
            >
              透明领域
            </span>
          </Link>
          <h1
            className="text-xl text-white/90 tracking-wide"
            style={{
              fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
              fontWeight: 300,
            }}
          >
            {t('signin')}
          </h1>
        </div>

        {/* Glass Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="text-sm text-red-400/90 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs text-white/40 tracking-wider uppercase"
                style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif', fontWeight: 300 }}
              >
                {t('email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="block w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 placeholder:text-white/20 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs text-white/40 tracking-wider uppercase"
                style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif', fontWeight: 300 }}
              >
                {t('password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="block w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 placeholder:text-white/20 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full bg-white/[0.1] hover:bg-white/[0.15] text-white/90 border border-white/[0.1] hover:border-white/[0.15] rounded-lg transition-all duration-300"
              isLoading={isLoading}
            >
              {t('signinButton')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-white/30">
            {t('noAccount')}{' '}
            <Link
              href="/auth/register"
              className="text-white/60 hover:text-white/90 transition-colors font-medium"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif', fontWeight: 300 }}
            >
              {t('register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

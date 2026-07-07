'use client';

import { useSession, signOut } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui';
import { useState } from 'react';

export function Header() {
  const t = useTranslations('nav');
  const commonT = useTranslations('common');
  const { data: session } = useSession();
  const locale = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userRole = (session?.user as any)?.role;
  const isAdmin = userRole === 'ADMIN';
  const isCommunity = userRole === 'COMMUNITY';

  const otherLocale = locale === 'zh' ? 'en' : 'zh';

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06]"
      style={{
        background: 'rgba(10, 10, 10, 0.7)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2.5 group">
            {/* App 图标 */}
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
              {locale === 'zh' ? '透明领域' : 'Transparent Domain'}
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-0.5">
            <Link href="/home" className="px-3 py-1.5 text-sm text-white/40 hover:text-white/80 rounded-md hover:bg-white/[0.04] transition-all duration-300"
              style={{
                fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                fontWeight: 300,
              }}
            >
              {t('home')}
            </Link>
            <Link href="/search" className="px-3 py-1.5 text-sm text-white/40 hover:text-white/80 rounded-md hover:bg-white/[0.04] transition-all duration-300"
              style={{
                fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                fontWeight: 300,
              }}
            >
              {t('search')}
            </Link>
            <Link href="/circles" className="px-3 py-1.5 text-sm text-white/40 hover:text-white/80 rounded-md hover:bg-white/[0.04] transition-all duration-300"
              style={{
                fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                fontWeight: 300,
              }}
            >
              {t('circles')}
            </Link>
          </nav>

          {/* Desktop Right */}
          <div className="hidden md:flex items-center space-x-2">
            {/* Locale Switcher */}
            <Link
              href="/home"
              locale={otherLocale}
              className="px-2.5 py-1 text-[11px] font-medium text-white/30 hover:text-white/60 border border-white/[0.06] hover:border-white/10 rounded-md transition-all duration-300"
            >
              {commonT('language')}
            </Link>

            {session ? (
              <div className="flex items-center space-x-1.5">
                {(isCommunity || isAdmin) && (
                  <Link href="/dashboard">
                    <Button variant="ghost" size="sm" className="text-white/40 hover:text-white/80 text-xs h-8 hover:bg-white/[0.04]">{t('dashboard')}</Button>
                  </Link>
                )}
                {isAdmin && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="text-white/40 hover:text-white/80 text-xs h-8 hover:bg-white/[0.04]">{t('admin')}</Button>
                  </Link>
                )}
                <span className="text-xs text-white/40 max-w-[80px] truncate">
                  {session.user?.name}
                </span>
                <Button variant="outline" size="sm" onClick={() => signOut()} className="border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.05] text-xs h-8">
                  {t('signout')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <Link href="/auth/signin">
                  <Button variant="ghost" size="sm" className="text-white/40 hover:text-white/80 text-xs h-8 hover:bg-white/[0.04]">{t('signin')}</Button>
                </Link>
                <Link href="/auth/register">
                  <Button variant="default" size="sm" className="bg-white/[0.08] text-white/80 hover:bg-white/[0.12] text-xs h-8 rounded-lg border border-white/[0.08]">{t('register')}</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-white/40 hover:bg-white/[0.04] transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-1 border-t border-white/[0.06] mt-2 pt-2">
            <Link href="/home" className="block px-3 py-2 text-sm text-white/50 hover:bg-white/[0.03] rounded-md"
              onClick={() => setMobileMenuOpen(false)}>
              {t('home')}
            </Link>
            <Link href="/search" className="block px-3 py-2 text-sm text-white/50 hover:bg-white/[0.03] rounded-md"
              onClick={() => setMobileMenuOpen(false)}>
              {t('search')}
            </Link>
            <Link href="/circles" className="block px-3 py-2 text-sm text-white/50 hover:bg-white/[0.03] rounded-md"
              onClick={() => setMobileMenuOpen(false)}>
              {t('circles')}
            </Link>
            {session ? (
              <>
                {(isCommunity || isAdmin) && (
                  <Link href="/dashboard" className="block px-3 py-2 text-sm text-white/50 hover:bg-white/[0.03] rounded-md"
                    onClick={() => setMobileMenuOpen(false)}>
                    {t('dashboard')}
                  </Link>
                )}
                {isAdmin && (
                  <Link href="/admin" className="block px-3 py-2 text-sm text-white/50 hover:bg-white/[0.03] rounded-md"
                    onClick={() => setMobileMenuOpen(false)}>
                    {t('admin')}
                  </Link>
                )}
                <Button variant="outline" size="sm" className="w-full border-white/[0.08] text-white/50 mt-1" onClick={() => signOut()}>
                  {t('signout')}
                </Button>
              </>
            ) : (
              <div className="flex space-x-2 pt-2">
                <Link href="/auth/signin" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm" className="flex-1 text-white/50 hover:text-white/80">{t('signin')}</Button>
                </Link>
                <Link href="/auth/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="default" size="sm" className="flex-1 bg-white/[0.08] text-white/80">{t('register')}</Button>
                </Link>
              </div>
            )}
            <Link
              href="/home"
              locale={otherLocale}
              className="block px-3 py-2 text-xs text-white/30"
              onClick={() => setMobileMenuOpen(false)}
            >
              {commonT('language')}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

'use client';

import { usePathname } from '@/lib/i18n/navigation';
import { Header } from './Header';
import { Footer } from './Footer';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === '/' || pathname === '/zh' || pathname === '/en';

  return (
    <>
      {!isHome && <Header />}
      <main className={isHome ? '' : 'flex-1'}>{children}</main>
      {!isHome && <Footer />}
    </>
  );
}

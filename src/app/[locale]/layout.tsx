import type { Metadata } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/lib/i18n/navigation';
import { Providers } from './providers';
import { ConditionalLayout } from '@/components/layout/ConditionalLayout';
import { HtmlLangSetter } from '@/components/layout/HtmlLangSetter';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export const metadata: Metadata = {
  title: "透明领域 - Transparent Domain",
  description: "科研透明度平台 — 展示科研领域影响力人物，推动学术透明度",
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as 'zh' | 'en')) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <>
      <HtmlLangSetter locale={locale} />
      <NextIntlClientProvider messages={messages}>
        <Providers>
          <ConditionalLayout>
            {children}
          </ConditionalLayout>
        </Providers>
      </NextIntlClientProvider>
    </>
  );
}

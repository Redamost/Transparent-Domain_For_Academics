import { getRequestConfig } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as 'zh' | 'en')) {
    locale = routing.defaultLocale;
  }

  // Use static JSON imports from public/locales
  let messages;
  try {
    messages = (await import(`../../../public/locales/${locale}/common.json`)).default;
  } catch {
    messages = (await import(`../../../public/locales/zh/common.json`)).default;
  }

  return { locale, messages };
});

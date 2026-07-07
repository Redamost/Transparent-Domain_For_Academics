import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://transparent-domain.org';

/**
 * Dynamic sitemap generation.
 * Includes all public pages: field pages, person profiles, and static pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Static pages
  const staticPages = [
    { path: '/zh', priority: 1.0, changeFrequency: 'daily' as const },
    { path: '/en', priority: 1.0, changeFrequency: 'daily' as const },
    { path: '/zh/search', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/en/search', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/zh/legal/privacy', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: '/en/legal/privacy', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: '/zh/legal/terms', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: '/en/legal/terms', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: '/zh/legal/disclaimer', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: '/en/legal/disclaimer', priority: 0.3, changeFrequency: 'monthly' as const },
  ];

  for (const page of staticPages) {
    entries.push({
      url: `${BASE_URL}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: {
        languages: {
          zh: `${BASE_URL}/zh${page.path.replace('/zh', '').replace('/en', '')}`,
          en: `${BASE_URL}/en${page.path.replace('/zh', '').replace('/en', '')}`,
        },
      },
    });
  }

  // Dynamic: Field pages
  try {
    const fields = await prisma.field.findMany({
      select: { slug: true, updatedAt: true },
      take: 500,
    });

    for (const field of fields) {
      const path = `/zh/field/${field.slug}`;
      entries.push({
        url: `${BASE_URL}${path}`,
        lastModified: field.updatedAt,
        changeFrequency: 'daily',
        priority: 0.7,
        alternates: {
          languages: {
            zh: `${BASE_URL}/zh/field/${field.slug}`,
            en: `${BASE_URL}/en/field/${field.slug}`,
          },
        },
      });
    }
  } catch (error) {
    console.warn('[Sitemap] Failed to fetch fields:', error);
  }

  // Dynamic: Person profiles
  try {
    const persons = await prisma.person.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
      take: 1000,
    });

    for (const person of persons) {
      const path = `/zh/person/${person.id}`;
      entries.push({
        url: `${BASE_URL}${path}`,
        lastModified: person.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: {
          languages: {
            zh: `${BASE_URL}/zh/person/${person.id}`,
            en: `${BASE_URL}/en/person/${person.id}`,
          },
        },
      });
    }
  } catch (error) {
    console.warn('[Sitemap] Failed to fetch persons:', error);
  }

  return entries;
}

// ─── Structured Data (JSON-LD) Components ───
// Provides schema.org markup for search engines.
// https://schema.org/

import type { PersonDetail, FieldNode } from '@/types';

// ─── Person Schema ───

interface PersonSchemaProps {
  person: PersonDetail;
  locale: string;
}

export function PersonSchema({ person, locale }: PersonSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: locale === 'zh' ? person.nameZh : (person.nameEn || person.nameZh),
    ...(person.alternativeNames ? { alternateName: person.alternativeNames } : {}),
    ...(person.title ? { jobTitle: person.title } : {}),
    ...(person.institution ? {
      affiliation: {
        '@type': 'Organization',
        name: person.institution,
        ...(person.department ? { department: { '@type': 'Organization', name: person.department } } : {}),
      },
    } : {}),
    ...(person.email ? { email: person.email } : {}),
    ...(person.website ? { url: person.website } : {}),
    ...(person.bioEn || person.bioZh ? {
      description: locale === 'zh' ? (person.bioZh || person.bioEn) : (person.bioEn || person.bioZh),
    } : {}),
    ...(person.hIndex ? { identifier: `h-index:${person.hIndex}` } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ─── Field / ResearchArea Schema ───

interface FieldSchemaProps {
  field: FieldNode;
  locale: string;
  personCount?: number;
}

export function FieldSchema({ field, locale }: FieldSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: locale === 'zh' ? field.nameZh : field.nameEn,
    ...(locale === 'zh' && field.descriptionZh
      ? { description: field.descriptionZh }
      : field.descriptionEn
        ? { description: field.descriptionEn }
        : {}),
    termCode: field.slug,
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: locale === 'zh' ? '透明领域 研究分类体系' : 'Transparent Domain Research Taxonomy',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ─── WebSite Schema (for homepage) ───

interface WebSiteSchemaProps {
  locale: string;
}

export function WebSiteSchema({ locale }: WebSiteSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: locale === 'zh' ? '透明领域 — 科研透明度平台' : 'Transparent Domain — Research Transparency Platform',
    description: locale === 'zh'
      ? '展示科研领域影响力人物，基于社区监督的浮动评分系统，推动科研透明度与学术诚信'
      : 'Showcasing influential researchers with a community-driven rating system promoting transparency and academic integrity',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://transparent-domain.org',
    inLanguage: ['zh', 'en'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://transparent-domain.org'}/${locale}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ─── Breadcrumb Schema ───

interface BreadcrumbSchemaProps {
  items: Array<{ name: string; url: string }>;
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

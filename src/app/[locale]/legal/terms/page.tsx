import { getTranslations } from 'next-intl/server';

export default async function TermsPage() {
  const t = await getTranslations('terms');

  return (
    <div className="min-h-screen home-bg relative">
      {/* Noise overlay */}
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Page header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-1 h-8 bg-neutral-400/20 rounded-full" />
            <h1
              className="text-3xl font-bold text-white/90 tracking-[0.1em]"
              style={{
                fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                fontWeight: 300,
              }}
            >
              {t('title')}
            </h1>
          </div>
          <p className="text-sm text-white/25 ml-5">
            {t('lastUpdated')}: 2025-01-01
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          <Section title={t('sections.acceptance.title')}>
            <p>{t('sections.acceptance.content')}</p>
          </Section>

          <Section title={t('sections.eligibility.title')}>
            <p>{t('sections.eligibility.content')}</p>
          </Section>

          <Section title={t('sections.accounts.title')}>
            <p>{t('sections.accounts.content')}</p>
          </Section>

          <Section title={t('sections.community.title')}>
            <p>{t('sections.community.content')}</p>
          </Section>

          <Section title={t('sections.content.title')}>
            <p>{t('sections.content.content')}</p>
            <ul className="mt-3 space-y-1.5">
              <ListItem>{t('sections.content.items.accuracy')}</ListItem>
              <ListItem>{t('sections.content.items.evidence')}</ListItem>
              <ListItem>{t('sections.content.items.harassment')}</ListItem>
              <ListItem>{t('sections.content.items.privacy')}</ListItem>
            </ul>
          </Section>

          <Section title={t('sections.termination.title')}>
            <p>{t('sections.termination.content')}</p>
          </Section>

          <Section title={t('sections.disclaimer.title')}>
            <p>{t('sections.disclaimer.content')}</p>
          </Section>

          <Section title={t('sections.contact.title')}>
            <p>
              {t('sections.contact.content')}{' '}
              <a href="mailto:legal@transparent-domain.org" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                legal@transparent-domain.org
              </a>
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6">
      <h2
        className="text-lg font-medium text-white/80 mb-3 tracking-[0.08em]"
        style={{
          fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
          fontWeight: 300,
        }}
      >
        {title}
      </h2>
      <div className="text-sm text-white/40 leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 block w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
      <span className="text-white/40 text-sm">{children}</span>
    </li>
  );
}

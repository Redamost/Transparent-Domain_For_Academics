import { getTranslations } from 'next-intl/server';

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');

  return (
    <div className="min-h-screen home-bg relative">
      {/* Noise overlay */}
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Page header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-1 h-8 bg-blue-400/20 rounded-full" />
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
          <Section title={t('sections.collection.title')}>
            <p>{t('sections.collection.content')}</p>
            <ul className="mt-3 space-y-1.5">
              <ListItem>{t('sections.collection.items.email')}</ListItem>
              <ListItem>{t('sections.collection.items.profile')}</ListItem>
              <ListItem>{t('sections.collection.items.research')}</ListItem>
              <ListItem>{t('sections.collection.items.usage')}</ListItem>
            </ul>
          </Section>

          <Section title={t('sections.usage.title')}>
            <p>{t('sections.usage.content')}</p>
          </Section>

          <Section title={t('sections.sharing.title')}>
            <p>{t('sections.sharing.content')}</p>
          </Section>

          <Section title={t('sections.storage.title')}>
            <p>{t('sections.storage.content')}</p>
          </Section>

          <Section title={t('sections.rights.title')}>
            <p>{t('sections.rights.content')}</p>
            <ul className="mt-3 space-y-1.5">
              <ListItem>{t('sections.rights.items.access')}</ListItem>
              <ListItem>{t('sections.rights.items.correction')}</ListItem>
              <ListItem>{t('sections.rights.items.deletion')}</ListItem>
              <ListItem>{t('sections.rights.items.portability')}</ListItem>
            </ul>
          </Section>

          <Section title={t('sections.cookies.title')}>
            <p>{t('sections.cookies.content')}</p>
          </Section>

          <Section title={t('sections.contact.title')}>
            <p>
              {t('sections.contact.content')}{' '}
              <a href="mailto:privacy@transparent-domain.org" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                privacy@transparent-domain.org
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

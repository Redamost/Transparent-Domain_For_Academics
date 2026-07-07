import { getTranslations } from 'next-intl/server';

export default async function DisclaimerPage() {
  const t = await getTranslations('disclaimer');

  return (
    <div className="min-h-screen home-bg relative">
      {/* Noise overlay */}
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Page header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-1 h-8 bg-amber-400/20 rounded-full" />
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
          <Section title={t('sections.ratings.title')}>
            <p>{t('sections.ratings.content')}</p>
          </Section>

          <Section title={t('sections.accuracy.title')}>
            <p>{t('sections.accuracy.content')}</p>
          </Section>

          <Section title={t('sections.thirdParty.title')}>
            <p>{t('sections.thirdParty.content')}</p>
          </Section>

          <Section title={t('sections.correction.title')}>
            <p className="bg-amber-400/5 border border-amber-400/15 rounded-lg p-4 text-amber-200/80">
              {t('sections.correction.content')}
            </p>
            <p className="mt-3">
              {t('sections.correction.contact')}{' '}
              <a href="mailto:correction@transparent-domain.org" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                correction@transparent-domain.org
              </a>
            </p>
          </Section>

          <Section title={t('sections.methodology.title')}>
            <p>{t('sections.methodology.content')}</p>
            <ul className="mt-3 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-white/15 mt-1.5 block w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                <span>{t('sections.methodology.items.citations')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/15 mt-1.5 block w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                <span>{t('sections.methodology.items.peerReview')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/15 mt-1.5 block w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                <span>{t('sections.methodology.items.publicData')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/15 mt-1.5 block w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                <span>{t('sections.methodology.items.communityReports')}</span>
              </li>
            </ul>
          </Section>

          <Section title={t('sections.liability.title')}>
            <p>{t('sections.liability.content')}</p>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Reusable section wrapper — dark glass style */
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

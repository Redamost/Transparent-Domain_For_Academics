'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link } from '@/lib/i18n/navigation';
import { Badge, Button } from '@/components/ui';
import { FloatingScore } from '@/components/rating/FloatingScore';
import type { PersonDetail } from '@/types';

type Tab = 'overview' | 'publications' | 'research' | 'competition' | 'evaluation' | 'history';

export function PersonProfile({ person }: { person: PersonDetail }) {
  const t = useTranslations('person');
  const ratingT = useTranslations('rating');
  const locale = useLocale();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const userRole = (session?.user as unknown as { role?: string })?.role;
  const canReport = session && (userRole === 'COMMUNITY' || userRole === 'ADMIN');

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: t('overview') },
    { key: 'publications', label: t('publications'), count: person.publications?.length || 0 },
    { key: 'research', label: t('researchFeed'), count: person.researchUpdates?.length || 0 },
    // Only show competition/evaluation tabs if data exists (coverage <1%)
    ...(person.competitionUpdates && person.competitionUpdates.length > 0
      ? [{ key: 'competition' as Tab, label: t('competitionFeed'), count: person.competitionUpdates.length }]
      : []),
    ...(person.evaluationUpdates && person.evaluationUpdates.length > 0
      ? [{ key: 'evaluation' as Tab, label: t('evaluationFeed'), count: person.evaluationUpdates.length }]
      : []),
    { key: 'history', label: t('ratingHistory') },
  ];

  return (
    <div className="min-h-screen home-bg relative">
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Header — Basic Info + Contact */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
              <div className="p-6">
                {/* Name + Basic Identity */}
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-white/60 font-bold text-2xl overflow-hidden flex-shrink-0 border border-white/[0.08]">
                    {person.avatarUrl ? (
                      <img src={person.avatarUrl} alt={person.nameZh} className="w-full h-full object-cover" />
                    ) : (
                      (person.nameEn || person.nameZh).charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1
                      className="text-2xl font-bold text-white/90"
                      style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
                    >{person.nameZh}</h1>
                    {/* English name — always visible */}
                    {person.nameEn ? (
                      <p className="text-lg text-white/40">{person.nameEn}</p>
                    ) : (
                      <p className="text-lg text-white/15 italic">{t('unknownNameEn')}</p>
                    )}
                    {/* Title — always visible */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {person.title ? (
                        <Badge variant="primary">{person.title}</Badge>
                      ) : (
                        <span className="text-xs text-white/15 italic">{t('unknownTitle')}</span>
                      )}
                      {person.isVerified && <Badge variant="success">Verified</Badge>}
                    </div>
                    {/* Basic Info — institution + department, always visible */}
                    <div className="mt-2 space-y-1 text-sm">
                      <p>
                        <span className="font-medium text-white/60">{t('institution')}:</span>{' '}
                        {person.institution ? (
                          <span className="text-white/50">{person.institution}</span>
                        ) : (
                          <span className="text-white/15 italic">{t('unknownInstitution')}</span>
                        )}
                      </p>
                      <p>
                        <span className="font-medium text-white/60">{t('department')}:</span>{' '}
                        {person.department ? (
                          <span className="text-white/50">{person.department}</span>
                        ) : (
                          <span className="text-white/15 italic">{t('unknownDepartment')}</span>
                        )}
                      </p>
                    </div>
                    {/* Contact Info — always visible */}
                    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1 text-sm">
                      <p className="font-medium text-white/40 mb-1">{t('contact')}</p>
                      {person.email ? (
                        <p>
                          <span className="font-medium text-white/60">{t('email')}:</span>{' '}
                          <a href={`mailto:${person.email}`} className="text-blue-400 hover:underline">{person.email}</a>
                        </p>
                      ) : (
                        <p className="text-white/15 italic"><span className="font-medium text-white/60">{t('email')}:</span> {t('unknownEmail')}</p>
                      )}
                      {person.website ? (
                        <p>
                          <span className="font-medium text-white/60">{t('website')}:</span>{' '}
                          <a href={person.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate max-w-[300px] inline-block align-bottom">{person.website}</a>
                        </p>
                      ) : (
                        <p className="text-white/15 italic"><span className="font-medium text-white/60">{t('website')}:</span> {t('unknownWebsite')}</p>
                      )}
                      {person.orcidId ? (
                        <p>
                          <span className="font-medium text-white/60">{t('orcid')}:</span>{' '}
                          <a href={`https://orcid.org/${person.orcidId}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{person.orcidId}</a>
                        </p>
                      ) : (
                        <p className="text-white/15 italic"><span className="font-medium text-white/60">{t('orcid')}:</span> {t('unknownOrcid')}</p>
                      )}
                      {person.googleScholarId ? (
                        <p>
                          <span className="font-medium text-white/60">{t('googleScholar')}:</span>{' '}
                          <a href={`https://scholar.google.com/citations?user=${person.googleScholarId}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">View Profile</a>
                        </p>
                      ) : (
                        <p className="text-white/15 italic"><span className="font-medium text-white/60">{t('googleScholar')}:</span> {t('unknownGS')}</p>
                      )}
                    </div>
                    {/* Scrape info */}
                    <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/15">
                      {person.lastScrapedAt ? (
                        <span>{t('scrapeDate')}: {new Date(person.lastScrapedAt).toLocaleDateString()}</span>
                      ) : (
                        <span>{t('notScraped')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/[0.08] space-x-1 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-white/40 text-white/90'
                      : 'border-transparent text-white/35 hover:text-white/60'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-1.5 text-[10px] text-white/25">({tab.count})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Bio */}
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                    <div className="p-6">
                      <h3
                        className="font-semibold text-white/80 mb-2"
                        style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
                      >{t('overview')}</h3>
                      {(locale === 'zh' ? person.bioZh : person.bioEn) || person.bioZh || person.bioEn ? (
                        <p className="text-white/50 text-sm leading-relaxed">
                          {locale === 'zh' ? (person.bioZh || person.bioEn) : (person.bioEn || person.bioZh)}
                        </p>
                      ) : (
                        <p className="text-white/25 text-sm">{t('noBio')}</p>
                      )}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                    <div className="p-6">
                      <h3
                        className="font-semibold text-white/80 mb-4"
                        style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
                      >{t('academicMetrics')}</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                          <div className="text-3xl font-bold text-white/90 leading-none" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.hIndex ?? '-'}</div>
                          <div className="text-xs text-white/35 mt-1">{t('hIndex')}</div>
                        </div>
                        <div className="text-center p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                          <div className="text-3xl font-bold text-white/90 leading-none" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
                            {person.citationCount?.toLocaleString() ?? '-'}
                          </div>
                          <div className="text-xs text-white/35 mt-1">{t('citations')}</div>
                        </div>
                        <div className="text-center p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                          <div className="text-3xl font-bold text-white/90 leading-none" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.publicationCount ?? '-'}</div>
                          <div className="text-xs text-white/35 mt-1">{t('publicationsCount')}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                    <div className="p-6">
                      <h3
                        className="font-semibold text-white/80 mb-3"
                        style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
                      >{t('fields')}</h3>
                      {person.fields.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {person.fields.map(f => (
                            <Link key={f.slug} href={`/field/${f.slug}`}>
                              <Badge variant={f.isPrimary ? 'primary' : 'default'} className="cursor-pointer">
                                {locale === 'zh' ? f.nameZh : f.nameEn} {f.isPrimary ? '★' : ''}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="text-white/15 italic text-sm">{t('unknownField')}</p>
                      )}
                    </div>
                  </div>

                  {/* Data completeness indicator */}
                  {(() => {
                    const filled = [
                      person.title, person.institution, person.department,
                      person.bioZh || person.bioEn, person.email,
                      person.hIndex, person.citationCount,
                    ].filter(Boolean).length;
                    const isSparse = filled <= 2;
                    return isSparse ? (
                      <div className="rounded-xl border border-amber-500/[0.12] bg-amber-500/[0.02] backdrop-blur-sm">
                        <div className="p-4">
                          <p className="text-xs text-amber-400/60">{t('dataIncomplete')}</p>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Disclaimer */}
                  <p className="text-xs text-white/20 px-1">{t('disclaimer')}</p>
                </div>
              )}

              {activeTab === 'publications' && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                  <div className="p-6">
                    {person.publications && person.publications.length > 0 ? (
                      <ul className="divide-y divide-white/[0.06]">
                        {person.publications.map((pub) => (
                          <li key={pub.id} className="py-4 first:pt-0 last:pb-0">
                            <a
                              href={pub.url || (pub.doi ? `https://doi.org/${pub.doi}` : '#')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group"
                            >
                              <h4 className="font-medium text-white/85 group-hover:text-blue-400 transition-colors">
                                {pub.title}
                              </h4>
                            </a>
                            <p className="text-sm text-white/35 mt-1">{pub.authors}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-white/25">
                              {pub.journal && <span>{pub.journal}</span>}
                              {pub.year && <span>{pub.year}</span>}
                              {pub.citationCount !== null && (
                                <span>Cited: {pub.citationCount}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-white/25 text-sm py-4">{t('noPublications')}</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'research' && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                  <div className="p-6">
                    {person.researchUpdates && person.researchUpdates.length > 0 ? (
                      <ul className="divide-y divide-white/[0.06]">
                        {person.researchUpdates.map((update) => (
                          <li key={update.id} className="py-4 first:pt-0 last:pb-0">
                            <a
                              href={update.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group"
                            >
                              <h4 className="font-medium text-white/85 group-hover:text-blue-400 transition-colors">
                                {update.title}
                              </h4>
                            </a>
                            {update.description && (
                              <p className="text-sm text-white/35 mt-1">{update.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-xs text-white/25">
                              {update.source && <span>Source: {update.source}</span>}
                              {update.publishedAt && (
                                <span>{new Date(update.publishedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-white/25 text-sm py-4">{t('noUpdates')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 竞赛动态 */}
              {activeTab === 'competition' && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                  <div className="p-6">
                    {person.competitionUpdates && person.competitionUpdates.length > 0 ? (
                      <ul className="divide-y divide-white/[0.06]">
                        {person.competitionUpdates.map((item) => (
                          <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                            <a
                              href={item.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group"
                            >
                              <h4 className="font-medium text-white/85 group-hover:text-blue-400 transition-colors">
                                {item.title}
                              </h4>
                            </a>
                            {item.description && (
                              <p className="text-sm text-white/35 mt-1">{item.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-white/25">
                              {item.level && (
                                <span className="text-amber-400/70">{t('competitionLevel')}: {item.level}</span>
                              )}
                              {item.award && (
                                <span className="text-emerald-400/70">{t('competitionAward')}: {item.award}</span>
                              )}
                              {item.source && <span>Source: {item.source}</span>}
                              {item.publishedAt && (
                                <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-white/25 text-sm py-4">{t('noCompetitionUpdates')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 评比动态 */}
              {activeTab === 'evaluation' && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                  <div className="p-6">
                    {person.evaluationUpdates && person.evaluationUpdates.length > 0 ? (
                      <ul className="divide-y divide-white/[0.06]">
                        {person.evaluationUpdates.map((item) => (
                          <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                            <a
                              href={item.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group"
                            >
                              <h4 className="font-medium text-white/85 group-hover:text-blue-400 transition-colors">
                                {item.title}
                              </h4>
                            </a>
                            {item.description && (
                              <p className="text-sm text-white/35 mt-1">{item.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-white/25">
                              {item.evalType && (
                                <span className="text-purple-400/70">{t('evaluationType')}: {item.evalType}</span>
                              )}
                              {item.result && (
                                <span className="text-amber-400/70">{t('evaluationResult')}: {item.result}</span>
                              )}
                              {item.source && <span>Source: {item.source}</span>}
                              {item.publishedAt && (
                                <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-white/25 text-sm py-4">{t('noEvaluationUpdates')}</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                  <div className="p-6">
                    <p className="text-white/25 text-sm py-4">{ratingT('noHistory')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Floating Score */}
          <div className="lg:col-span-1">
            <FloatingScore
              score={person.score}
              personId={person.id}
              scoreUpdatedAt={person.scoreUpdatedAt}
            />

            {/* Report Button — only shown to authenticated community members */}
            {canReport ? (
              <div className="mt-4">
                <Link href={`/dashboard/reports?personId=${person.id}`}>
                  <Button
                    variant="outline"
                    size="md"
                    className="w-full border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                  >
                    {t('reportButton')}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-xs text-white/15 text-center">
                  <Link href={`/${locale}/auth/signin`} className="text-blue-400/60 hover:text-blue-400 transition-colors">
                    登录
                  </Link>
                  {' '}后即可提交报告
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

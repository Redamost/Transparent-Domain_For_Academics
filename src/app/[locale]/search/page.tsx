'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { PersonCard } from '@/components/person/PersonCard';
import { Button } from '@/components/ui';
import { useQuery } from '@tanstack/react-query';
import { MouseFollowGlass } from '@/components/effects/MouseFollowGlass';
import { Particles } from '@/components/effects/Particles';

async function searchPersons(params: URLSearchParams) {
  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

function SearchResults() {
  const t = useTranslations('search');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams?.get('q') || '');
  const [sort, setSort] = useState('score_desc');
  const [page, setPage] = useState(1);

  // Sync query from URL when searchParams changes
  useEffect(() => {
    const q = searchParams?.get('q') || '';
    setQuery(q);
  }, [searchParams]);

  const queryParams = new URLSearchParams();
  if (query) queryParams.set('q', query);
  queryParams.set('sort', sort);
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', query, sort, page],
    queryFn: () => searchPersons(queryParams),
    enabled: !!query,
  });

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setPage(1);
    }
  }, [query, router]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-white/90 mb-6"
        style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
      >{t('title')}</h1>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6 max-w-2xl">
        <input
          type="text"
          placeholder={t('placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none focus:ring-0 rounded-xl h-12 px-4 text-base transition-colors"
        />
        <Button type="submit" variant="primary" size="md" className="bg-white/10 text-white hover:bg-white/15 border border-white/[0.08] rounded-xl h-12 px-5 transition-all duration-300 hover:scale-105 shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </Button>
      </form>

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="text-sm border border-white/[0.08] rounded-lg px-3 py-2 bg-white/[0.04] text-white/70"
        >
          <option value="score_desc" className="bg-neutral-900">{t('sortScoreDesc')}</option>
          <option value="score_asc" className="bg-neutral-900">{t('sortScoreAsc')}</option>
          <option value="name_asc" className="bg-neutral-900">{t('sortNameAsc')}</option>
          <option value="hIndex_desc" className="bg-neutral-900">{t('sortHIndexDesc')}</option>
        </select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="text-center py-12 text-white/30">
          <div className="animate-spin w-8 h-8 border-4 border-white/20 border-t-white/60 rounded-full mx-auto mb-4" />
          Searching...
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-400/80">Search failed. Please try again.</div>
      ) : data && data.data ? (
        <>
          <p className="text-sm text-white/30 mb-4">{data.total} results found</p>
          {data.data.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.data.map((person: any) => (
                <SearchPersonCard key={person.id} person={person} />
              ))}
            </div>
          ) : (
            <p className="text-center py-12 text-white/30">{t('noResults')}</p>
          )}

          {/* Pagination */}
          {data.hasMore && (
            <div className="flex justify-center mt-8">
              <Button variant="outline" onClick={() => setPage(p => p + 1)} className="border-white/[0.08] text-white/60 hover:bg-white/[0.04] hover:text-white/80"
              >
                Load More
              </Button>
            </div>
          )}
        </>
      ) : query ? null : (
        <p className="text-center py-12 text-white/30">Enter a search term to find researchers</p>
      )}
    </div>
  );
}

function SearchPersonCard({ person }: { person: any }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/person/${person.id}`)}
      className="group block relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] w-full text-left"
    >
      <div className="absolute inset-0 glass-researcher opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative p-5 space-y-3">
        {/* Header with avatar and score */}
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-white/70 font-bold text-lg overflow-hidden border border-white/10">
            {person.avatarUrl ? (
              <img src={person.avatarUrl} alt={person.nameZh} className="w-full h-full object-cover" />
            ) : (
              (person.nameEn || person.nameZh).charAt(0).toUpperCase()
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-white/80 leading-none" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.score.toFixed(0)}</div>
            <div className="text-[10px] text-white/25 mt-0.5">评分</div>
          </div>
        </div>

        {/* Name */}
        <div>
          <h3 className="font-semibold text-white/85 line-clamp-1">{person.nameZh}</h3>
          {person.nameEn && (
            <p className="text-sm text-white/30 line-clamp-1">{person.nameEn}</p>
          )}
        </div>

        {/* Title & Institution */}
        <div className="space-y-1">
          {person.title && (
            <p className="text-sm text-white/40 line-clamp-1">{person.title}</p>
          )}
          {person.institution && (
            <p className="text-xs text-white/25 line-clamp-1">{person.institution}</p>
          )}
        </div>

        {/* Fields */}
        {person.primaryFields && person.primaryFields.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {person.primaryFields.slice(0, 3).map((f: any) => (
              <span key={f.slug} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-white/[0.06] text-white/50 border border-white/[0.06]">
                {f.nameZh}
              </span>
            ))}
          </div>
        )}

        {/* Metrics */}
        <div className="flex gap-4 text-sm text-white/35 pt-2 border-t border-white/[0.06]">
          {person.hIndex !== null && (
            <span>H指数 <strong className="text-white/60 font-semibold" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.hIndex}</strong></span>
          )}
          {person.citationCount !== null && (
            <span>引用 <strong className="text-white/60 font-semibold" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.citationCount.toLocaleString()}</strong></span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] home-bg relative">
      {/* Subtle background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="gradient-orb w-[500px] h-[500px] bg-neutral-700 top-[5%] right-[10%] animate-float-slow"
          style={{ animationDelay: '0s', opacity: 0.08 }}
        />
      </div>
      <div className="fixed inset-0 noise-bg pointer-events-none" />
      <MouseFollowGlass className="fixed inset-0 pointer-events-none z-0" />
      <Particles count={30} color="rgba(255,255,255,0.08)" />

      <div className="relative z-10">
        <Suspense fallback={
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse h-8 bg-white/[0.06] rounded w-48 mb-6" />
            <div className="animate-pulse h-10 bg-white/[0.06] rounded max-w-2xl mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-32 bg-white/[0.06] rounded-2xl" />
              ))}
            </div>
          </div>
        }>
          <SearchResults />
        </Suspense>
      </div>
    </div>
  );
}

'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';

interface SearchBarProps {
  className?: string;
}

export function SearchBar({ className = '' }: SearchBarProps) {
  const t = useTranslations('home');
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <div className="flex-1">
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-white/10 border border-white/15 text-white placeholder:text-neutral-400 focus:border-white/40 focus:outline-none focus:ring-0 rounded-xl h-12 px-4 text-base transition-colors"
        />
      </div>
      <Button
        type="submit"
        size="md"
        className="bg-white text-neutral-950 hover:bg-neutral-200 rounded-xl h-12 px-5 transition-all duration-300 hover:scale-105 shrink-0"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </Button>
    </form>
  );
}

'use client';

import { Link } from '@/lib/i18n/navigation';

interface FieldNode {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  level: number;
  children: unknown[];
  _count?: { persons: number };
}

interface PopularFieldsProps {
  fields: FieldNode[];
}

export function PopularFields({ fields }: PopularFieldsProps) {
  const hasFields = fields && fields.length > 0;

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-7xl mx-auto">
        {/* Section Header — 色块分割，细宋体，无图标 */}
        <div className="flex items-center gap-5 mb-12">
          <div className="w-1.5 h-10 bg-blue-400/20 rounded-full" />
          <h2
            className="text-2xl sm:text-3xl text-white/70 tracking-[0.2em]"
            style={{
              fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
              fontWeight: 200,
            }}
          >
            热门领域
          </h2>
          <div className="flex-1" />
        </div>

        {hasFields ? (
          /* Fields Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((field, index) => (
              <Link
                key={field.slug}
                href={`/field/${field.slug}`}
                className="group relative block rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] bg-white/[0.04] border border-white/[0.06] hover:border-blue-400/30 shadow-none hover:shadow-lg hover:shadow-black/10"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="relative p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3
                      className="font-medium text-white/80 group-hover:text-white transition-colors text-lg"
                      style={{
                        fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
                        fontWeight: 300,
                      }}
                    >
                      {field.nameZh}
                    </h3>
                    {field._count && (
                      <span className="text-xs text-white/30 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/[0.06]">
                        <span style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{field._count.persons}</span> 位研究者
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/25 mb-4">{field.nameEn}</p>

                  {/* Children tags */}
                  {field.children && field.children.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(field.children as FieldNode[]).slice(0, 4).map((child) => (
                        <span
                          key={child.slug}
                          className="text-xs text-blue-400/60 bg-blue-400/5 px-2 py-0.5 rounded border border-blue-400/20"
                        >
                          {child.nameZh}
                        </span>
                      ))}
                      {field.children.length > 4 && (
                        <span className="text-xs text-white/15" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>+{field.children.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* Arrow */}
                  <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0">
                    <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="inline-flex flex-col items-center gap-3 px-8 py-6 rounded-2xl border border-white/[0.06] bg-white/[0.03]">
              <div className="w-8 h-8 rounded-full border border-white/[0.08] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white/[0.15]" />
              </div>
              <p className="text-sm text-white/25">暂无领域数据</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

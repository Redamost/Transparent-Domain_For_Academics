import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Link } from '@/lib/i18n/navigation';
import { PersonCard } from '@/components/person/PersonCard';
import { Badge } from '@/components/ui';

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function FieldPage({ params }: Props) {
  const t = await getTranslations('field');
  const { slug } = await params;

  const field = await prisma.field.findUnique({
    where: { slug },
    include: {
      parent: true,
      children: {
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { persons: true } } },
      },
      persons: {
        include: {
          person: {
            include: {
              fields: {
                where: { isPrimary: true },
                include: { field: true },
              },
            },
          },
        },
        take: 50,
      },
      _count: { select: { persons: true } },
    },
  });

  if (!field) notFound();

  // Build breadcrumbs
  const breadcrumbs: { name: string; slug: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = field.parent;
  while (current) {
    breadcrumbs.unshift({ name: current.nameZh, slug: current.slug });
    current = current.parent;
  }

  const avgScore = field.persons.length > 0
    ? Math.round(field.persons.reduce((sum, pf) => sum + pf.person.score, 0) / field.persons.length * 10) / 10
    : null;

  return (
    <div className="min-h-screen home-bg relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="gradient-orb w-[500px] h-[500px] bg-neutral-700 top-[10%] right-[10%] animate-float-slow"
          style={{ opacity: 0.06 }}
        />
      </div>
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center space-x-2 text-sm text-white/30 mb-4">
          <Link href="/home" className="hover:text-white/60 transition-colors">Home</Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.slug} className="flex items-center space-x-2">
              <span>/</span>
              <Link href={`/field/${crumb.slug}`} className="hover:text-white/60 transition-colors">{crumb.name}</Link>
            </span>
          ))}
          <span className="flex items-center space-x-2">
            <span>/</span>
            <span className="text-white/70 font-medium">{field.nameZh}</span>
          </span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-white/90"
            style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
          >{field.nameZh}</h1>
          <p className="text-lg text-white/40 mt-1">{field.nameEn}</p>
          {field.descriptionZh && (
            <p className="text-white/50 mt-3 max-w-2xl">{field.descriptionZh}</p>
          )}
          <div className="flex items-center gap-4 mt-3">
            <Badge variant="primary">{t('personCount')}: <span style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{field._count.persons}</span></Badge>
            {avgScore !== null && (
              <Badge variant="info">{t('avgScore')}: <span style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{avgScore}</span></Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar: Sub-fields */}
          <aside className="lg:col-span-1">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5">
              <h2
                className="font-semibold text-white/80 mb-3"
                style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
              >{t('subFields')}</h2>
              {field.children.length > 0 ? (
                <ul className="space-y-2">
                  {field.children.map((child) => (
                    <li key={child.slug}>
                      <Link
                        href={`/field/${child.slug}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-white/50 hover:bg-white/[0.04] hover:text-white/80 transition-colors"
                      >
                        <span>{child.nameZh}</span>
                        <Badge variant="default">{child._count.persons}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-white/25">{t('noSubFields')}</p>
              )}
            </div>
          </aside>

          {/* Main: Persons */}
          <div className="lg:col-span-3">
            <h2
              className="text-xl font-semibold text-white/80 mb-4"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >{t('personsInField')}</h2>
            {field.persons.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {field.persons.map(({ person }) => (
                  <PersonCard key={person.id} person={{
                    id: person.id,
                    nameZh: person.nameZh,
                    nameEn: person.nameEn,
                    title: person.title,
                    institution: person.institution,
                    avatarUrl: person.avatarUrl,
                    score: person.score,
                    hIndex: person.hIndex,
                    citationCount: person.citationCount,
                    primaryFields: person.fields.map(pf => ({
                      slug: pf.field.slug,
                      nameZh: pf.field.nameZh,
                      nameEn: pf.field.nameEn,
                    })),
                  }} />
                ))}
              </div>
            ) : (
              <p className="text-center text-white/25 py-12">No researchers in this field yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

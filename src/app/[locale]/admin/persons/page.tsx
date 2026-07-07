'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Card, Button } from '@/components/ui';
import { Link } from '@/lib/i18n/navigation';

async function fetchPersons() {
  const res = await fetch('/api/persons?limit=50');
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function AdminPersonsPage() {
  const t = useTranslations('admin');
  const { data, isLoading } = useQuery({
    queryKey: ['adminPersons'],
    queryFn: fetchPersons,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('persons')}</h1>
        <Link href="/admin/persons/new">
          <Button variant="primary" size="sm">+ Add Person</Button>
        </Link>
      </div>

      <Card>
        <div className="p-6">
          {isLoading ? (
            <p className="text-gray-400 py-4">Loading...</p>
          ) : data?.data?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-3 font-medium">Name (ZH)</th>
                  <th className="pb-3 font-medium">Name (EN)</th>
                  <th className="pb-3 font-medium">Institution</th>
                  <th className="pb-3 font-medium">Score</th>
                  <th className="pb-3 font-medium">H-Index</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map((person: any) => (
                  <tr key={person.id} className="hover:bg-gray-50">
                    <td className="py-3 text-gray-900">{person.nameZh}</td>
                    <td className="py-3 text-gray-500">{person.nameEn || '-'}</td>
                    <td className="py-3 text-gray-500">{person.institution || '-'}</td>
                    <td className="py-3 text-sm" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>{person.score?.toFixed(0)}</td>
                    <td className="py-3 text-gray-500">{person.hIndex ?? '-'}</td>
                    <td className="py-3 space-x-2">
                      <Link href={`/person/${person.id}`} className="text-blue-600 hover:underline text-xs">View</Link>
                      <Link href={`/admin/persons/${person.id}/edit`} className="text-gray-600 hover:underline text-xs">Edit</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-400 py-4">No persons found.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

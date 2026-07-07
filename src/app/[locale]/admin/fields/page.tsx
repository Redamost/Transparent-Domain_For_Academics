'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge } from '@/components/ui';

async function fetchFields() {
  const res = await fetch('/api/fields');
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

function FieldRow({ field, depth = 0 }: { field: any; depth?: number }) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="py-2" style={{ paddingLeft: `${depth * 24 + 8}px` }}>
          <span className="text-sm text-gray-900">{field.nameZh}</span>
          <span className="text-xs text-gray-400 ml-2">{field.nameEn}</span>
        </td>
        <td className="py-2">
          <Badge variant="default">{field.slug}</Badge>
        </td>
        <td className="py-2 text-xs text-gray-500">Level {field.level}</td>
        <td className="py-2 text-xs text-gray-500">
          {field._count?.persons || 0} persons
        </td>
      </tr>
      {field.children?.map((child: any) => (
        <FieldRow key={child.slug} field={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function AdminFieldsPage() {
  const t = useTranslations('admin');
  const { data: fields, isLoading } = useQuery({
    queryKey: ['adminFields'],
    queryFn: fetchFields,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('fields')}</h1>
      <Card>
        <div className="p-6">
          {isLoading ? (
            <p className="text-gray-400 py-4">Loading...</p>
          ) : fields?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Slug</th>
                  <th className="pb-3 font-medium">Level</th>
                  <th className="pb-3 font-medium">Persons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fields.map((field: any) => (
                  <FieldRow key={field.slug} field={field} />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-400 py-4">No fields defined.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

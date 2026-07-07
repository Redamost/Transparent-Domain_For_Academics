'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge } from '@/components/ui';
import { Link } from '@/lib/i18n/navigation';
import { useState } from 'react';

async function fetchReports(status: string) {
  const params = new URLSearchParams({ limit: '50' });
  if (status) params.set('status', status);
  const res = await fetch(`/api/reports?${params}`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export default function AdminReportsPage() {
  const t = useTranslations('admin');
  const reportT = useTranslations('report');
  const [statusFilter, setStatusFilter] = useState('PENDING');

  const { data, isLoading } = useQuery({
    queryKey: ['adminReports', statusFilter],
    queryFn: () => fetchReports(statusFilter),
  });

  const statuses = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('reports')}</h1>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {reportT(`status_${s}`)}
          </button>
        ))}
      </div>

      {/* Reports Table */}
      <Card>
        <div className="p-6">
          {isLoading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
          ) : data?.data?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-3 font-medium">Title</th>
                  <th className="pb-3 font-medium">Category</th>
                  <th className="pb-3 font-medium">Reporter</th>
                  <th className="pb-3 font-medium">Person</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map((report: any) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="py-3 text-gray-900 max-w-xs truncate">{report.title}</td>
                    <td className="py-3">
                      <Badge variant="warning">{report.category}</Badge>
                    </td>
                    <td className="py-3 text-gray-500">{report.reporterName}</td>
                    <td className="py-3 text-gray-500">{report.personName}</td>
                    <td className="py-3 text-gray-500 text-xs">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/admin/reports/${report.id}`}
                        className="text-blue-600 hover:underline text-xs font-medium"
                      >
                        {t('review')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">No reports found.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

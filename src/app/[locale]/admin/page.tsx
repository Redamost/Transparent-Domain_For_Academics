'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui';
import { Link } from '@/lib/i18n/navigation';

async function fetchAdminStats() {
  const [reportRes, personsRes, usersRes] = await Promise.all([
    fetch('/api/reports?status=PENDING&limit=5'),
    fetch('/api/persons?limit=1'),
    fetch('/api/stats'),
  ]);
  const reports = await reportRes.json();
  const persons = await personsRes.json();
  const stats = await usersRes.json();
  return { reports, persons, stats };
}

export default function AdminDashboardPage() {
  const t = useTranslations('admin');
  const { data, isLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: fetchAdminStats,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('dashboard')}</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-600" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
            {isLoading ? '-' : data?.reports?.total || 0}
          </div>
          <div className="text-sm text-gray-500">{t('pendingReports')}</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-600" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
            {isLoading ? '-' : data?.persons?.total || 0}
          </div>
          <div className="text-sm text-gray-500">{t('totalPersons')}</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-emerald-600" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
            {isLoading ? '-' : data?.stats?.communityMembers || 0}
          </div>
          <div className="text-sm text-gray-500">{t('communityMembers')}</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-indigo-600" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>0</div>
          <div className="text-sm text-gray-500">{t('recentChanges')}</div>
        </Card>
      </div>

      {/* Pending Reports */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{t('pendingReports')}</h2>
            <Link href="/admin/reports" className="text-sm text-blue-600 hover:underline">View All</Link>
          </div>
          {isLoading ? (
            <p className="text-sm text-gray-400 py-4">Loading...</p>
          ) : data?.reports?.data?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Reporter</th>
                  <th className="pb-2 font-medium">Person</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.reports!.data!.map((report: any) => (
                  <tr key={report.id}>
                    <td className="py-2 text-gray-900">{report.title}</td>
                    <td className="py-2 text-gray-500">{report.reporterName}</td>
                    <td className="py-2 text-gray-500">{report.personName}</td>
                    <td className="py-2 text-gray-500">{new Date(report.createdAt).toLocaleDateString()}</td>
                    <td className="py-2">
                      <Link href={`/admin/reports/${report.id}`} className="text-blue-600 hover:underline">
                        {t('review')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 py-4">No pending reports.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

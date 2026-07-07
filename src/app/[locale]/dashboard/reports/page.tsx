'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui';

interface ReportData {
  id: string;
  reporterId: string;
  reporterName: string;
  personId: string;
  personName: string;
  category: string;
  title: string;
  status: string;
  severity: number | null;
  createdAt: string;
}

async function fetchReports(params: string = ''): Promise<{ data: ReportData[]; total: number; page: number; limit: number }> {
  const res = await fetch(`/api/reports?limit=50${params}`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

async function fetchPerson(fieldId: string): Promise<any> {
  const res = await fetch(`/api/persons/${fieldId}`);
  if (!res.ok) return null;
  return res.json();
}

const CATEGORY_KEYS: Record<string, string> = {
  ACADEMIC_MISCONDUCT: 'category_ACADEMIC_MISCONDUCT',
  RIGOROUS_RESEARCH: 'category_RIGOROUS_RESEARCH',
  CONFLICT_OF_INTEREST: 'category_CONFLICT_OF_INTEREST',
  CITATION_MANIPULATION: 'category_CITATION_MANIPULATION',
  OTHER: 'category_OTHER',
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  UNDER_REVIEW: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
  APPEALED: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export default function DashboardReportsPage() {
  const t = useTranslations('report');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();

  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    personId: '',
    category: 'ACADEMIC_MISCONDUCT',
    title: '',
    description: '',
    severity: 3,
    evidenceIds: [] as string[],
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Fetch my reports
  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['myReportsFull'],
    queryFn: () => fetchReports(),
  });

  // Search persons for the form
  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.data || []);
      }
    } catch { /* ignore */ }
  };

  // Submit report mutation
  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Submit failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitStatus('success');
      setFormData({ personId: '', category: 'ACADEMIC_MISCONDUCT', title: '', description: '', severity: 3, evidenceIds: [] });
      setSelectedPerson(null);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['myReportsFull'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
    onError: () => setSubmitStatus('error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson) return;
    submitMutation.mutate({ ...formData, personId: selectedPerson.id });
  };

  const reports = reportsData?.data || [];
  const statusFilter = (status: string) => reports.filter(r => r.status === status).length;

  // ─── Auth guard: require sign-in ───
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen home-bg relative flex items-center justify-center">
        <div className="fixed inset-0 noise-bg pointer-events-none" />
        <div className="relative z-10 text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/30 text-sm">{commonT('loading')}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    const signInHref = `/${locale}/auth/signin`;
    return (
      <div className="min-h-screen home-bg relative flex items-center justify-center">
        <div className="fixed inset-0 noise-bg pointer-events-none" />
        <div className="relative z-10 max-w-md mx-auto px-4 text-center">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-8">
            <div className="w-12 h-12 rounded-full border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h2
              className="text-xl font-bold text-white/80 mb-2"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >
              请先登录
            </h2>
            <p className="text-sm text-white/35 mb-6">
              提交学术报告需要先登录账户。登录后即可参与社区监督。
            </p>
            <Link href={signInHref}>
              <Button
                variant="primary"
                size="md"
                className="w-full bg-white/10 text-white hover:bg-white/15 border border-white/[0.08] rounded-xl h-11 transition-all duration-300"
              >
                前往登录
              </Button>
            </Link>
            <p className="text-xs text-white/15 mt-4">
              还没有账户？{' '}
              <Link href={`/${locale}/auth/register`} className="text-blue-400/70 hover:text-blue-400 transition-colors">
                立即注册
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen home-bg relative">
      <div className="fixed inset-0 noise-bg pointer-events-none" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/dashboard" className="text-sm text-white/30 hover:text-white/50 transition-colors mb-1 inline-block">
              ← {commonT('back')}
            </Link>
            <h1
              className="text-2xl font-bold text-white/90"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}
            >
              {t('myReports') || '我的报告'}
            </h1>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => { setShowForm(!showForm); setSubmitStatus('idle'); }}
            className="bg-white/10 text-white hover:bg-white/15 border border-white/[0.08] rounded-xl h-11 px-5 transition-all duration-300"
          >
            {showForm ? commonT('cancel') : t('submit')}
          </Button>
        </div>

        {/* Submit Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-6 mb-8 space-y-5">
            <h2 className="text-lg font-semibold text-white/80"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}>
              {t('title')}
            </h2>

            {/* Person Search */}
            <div>
              <label className="block text-sm text-white/40 mb-1.5">{t('selectPerson')}</label>
              {selectedPerson ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04]">
                  <span className="text-white/80 text-sm">{selectedPerson.name}</span>
                  <button type="button" onClick={() => { setSelectedPerson(null); setSearchQuery(''); setSearchResults([]); }}
                    className="text-white/25 hover:text-white/60 text-xs ml-auto">✕</button>
                </div>
              ) : (
                <>
                  <input
                    type="text" value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="输入研究人员姓名..."
                    className="w-full bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/25 rounded-lg h-10 px-3 text-sm focus:border-white/20 focus:outline-none"
                  />
                  {searchResults.length > 0 && (
                    <ul className="mt-1.5 border border-white/[0.08] bg-[#1a1a1a] rounded-lg max-h-48 overflow-y-auto">
                      {searchResults.map((person: any) => (
                        <li key={person.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPerson({ id: person.id, name: person.nameZh });
                              setSearchQuery('');
                              setSearchResults([]);
                            }}
                            className="w-full text-left px-3 py-2.5 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                          >
                            {person.nameZh}
                            {person.institution && <span className="text-white/25 ml-2 text-xs">{person.institution}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm text-white/40 mb-1.5">{t('category')}</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-white/[0.04] border border-white/[0.08] text-white/70 rounded-lg h-10 px-3 text-sm focus:border-white/20 focus:outline-none"
              >
                {Object.entries(CATEGORY_KEYS).map(([key, labelKey]) => (
                  <option key={key} value={key} className="bg-neutral-900">{t(labelKey) || key}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm text-white/40 mb-1.5">{t('summary')}</label>
              <input
                type="text" value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="5-200字报告标题" required minLength={5} maxLength={200}
                className="w-full bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/25 rounded-lg h-10 px-3 text-sm focus:border-white/20 focus:outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm text-white/40 mb-1.5">{t('description')}</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('descriptionPlaceholder') || '50字以上详细描述...'} required minLength={50} maxLength={5000}
                rows={5}
                className="w-full bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/25 rounded-lg p-3 text-sm focus:border-white/20 focus:outline-none resize-y"
              />
              <div className="text-xs text-white/25 mt-1 text-right">{formData.description.length} / 5000</div>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-sm text-white/40 mb-1.5">{t('severity')} ({formData.severity}/5)</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level} type="button"
                    onClick={() => setFormData({ ...formData, severity: level })}
                    className={`w-10 h-10 rounded-lg border text-sm font-medium transition-all ${
                      formData.severity === level
                        ? 'bg-white/[0.1] border-white/30 text-white'
                        : 'bg-white/[0.03] border-white/[0.06] text-white/30 hover:border-white/15'
                    }`}
                  >{level}</button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center gap-4">
              <Button
                type="submit" variant="primary" size="md"
                disabled={!selectedPerson || formData.title.length < 5 || formData.description.length < 50 || submitMutation.isPending}
                className="bg-white/10 text-white hover:bg-white/15 border border-white/[0.08] rounded-xl h-11 px-6 transition-all duration-300 disabled:opacity-30"
              >
                {submitMutation.isPending ? commonT('loading') : t('submit')}
              </Button>
              {submitStatus === 'success' && (
                <span className="text-sm text-emerald-400">{t('success')}</span>
              )}
              {submitStatus === 'error' && (
                <span className="text-sm text-red-400">{commonT('error')}</span>
              )}
            </div>
          </form>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'PENDING', count: statusFilter('PENDING') },
            { label: 'UNDER_REVIEW', count: statusFilter('UNDER_REVIEW') },
            { label: 'APPROVED', count: statusFilter('APPROVED') },
            { label: 'REJECTED', count: statusFilter('REJECTED') },
            { label: 'TOTAL', count: reports.length },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-3 text-center">
              <div className="text-xl font-bold text-white/70">{s.count}</div>
              <div className="text-[10px] text-white/25 mt-0.5">
                {s.label === 'TOTAL' ? '总计' : t(`status_${s.label}`) || s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Reports List */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
          <div className="p-6">
            <h2 className="font-semibold text-white/80 mb-4"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif' }}>
              {t('myReports') || '我的报告'}
            </h2>
            {isLoading ? (
              <div className="text-center py-8 text-white/25">{commonT('loading')}</div>
            ) : reports.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-3 px-3 text-white/25 font-normal text-xs">{t('summary')}</th>
                      <th className="text-left py-3 px-3 text-white/25 font-normal text-xs hidden sm:table-cell">研究人员</th>
                      <th className="text-left py-3 px-3 text-white/25 font-normal text-xs hidden md:table-cell">{t('category')}</th>
                      <th className="text-left py-3 px-3 text-white/25 font-normal text-xs">{t('status')}</th>
                      <th className="text-left py-3 px-3 text-white/25 font-normal text-xs hidden md:table-cell">日期</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {reports.map((report) => (
                      <tr key={report.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-3">
                          <Link href={`/person/${report.personId}`} className="text-white/80 hover:text-white/90 font-medium">
                            {report.title}
                          </Link>
                          <div className="text-xs text-white/20 mt-0.5 md:hidden">{report.personName}</div>
                        </td>
                        <td className="py-3 px-3 hidden sm:table-cell">
                          <Link href={`/person/${report.personId}`} className="text-white/50 hover:text-white/70 text-xs">
                            {report.personName}
                          </Link>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          <span className="text-xs text-white/25">
                            {t(CATEGORY_KEYS[report.category]) || report.category}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLASSES[report.status] || 'bg-white/[0.04] text-white/40 border-white/[0.08]'}`}>
                            {t(`status_${report.status}`) || report.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          <span className="text-xs text-white/25">
                            {new Date(report.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full border border-white/[0.08] flex items-center justify-center">
                    <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-white/25">暂无报告</p>
                  <p className="text-xs text-white/15">点击上方"提交报告"开始</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

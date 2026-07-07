'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button } from '@/components/ui';
import { useState } from 'react';

async function fetchReport(id: string) {
  const res = await fetch(`/api/reports/${id}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

async function reviewReport(id: string, data: { action: string; notes?: string; scoreDelta?: Record<string, number> }) {
  const res = await fetch(`/api/reports/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Review failed');
  return res.json();
}

const CATEGORIES = [
  'RESEARCH_QUALITY',
  'METHODOLOGY_RIGOR',
  'COLLABORATION_ETHICS',
  'CITATION_INTEGRITY',
  'PEER_RECOGNITION',
  'COMMUNITY_FEEDBACK',
] as const;

export default function AdminReportReviewPage() {
  const t = useTranslations('admin');
  const ratingT = useTranslations('rating');
  const reportT = useTranslations('report');
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [scoreDeltas, setScoreDeltas] = useState<Record<string, number>>({});

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', id],
    queryFn: () => fetchReport(id),
  });

  const reviewMutation = useMutation({
    mutationFn: (data: { action: string; notes?: string; scoreDelta?: Record<string, number> }) =>
      reviewReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      queryClient.invalidateQueries({ queryKey: ['adminReports'] });
    },
  });

  function handleApprove() {
    reviewMutation.mutate({
      action: 'APPROVE',
      notes,
      scoreDelta: Object.keys(scoreDeltas).length > 0 ? scoreDeltas : undefined,
    });
  }

  function handleReject() {
    if (!notes.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    reviewMutation.mutate({ action: 'REJECT', notes });
  }

  if (isLoading) {
    return <div className="p-8 text-gray-400">Loading report...</div>;
  }

  if (!report) {
    return <div className="p-8 text-gray-400">Report not found</div>;
  }

  const isReviewed = report.status !== 'PENDING' && report.status !== 'UNDER_REVIEW';

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('review')}: {report.title}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Report Details */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="warning">{reportT(`category_${report.category}`)}</Badge>
                <Badge variant={
                  report.status === 'PENDING' ? 'warning' :
                  report.status === 'APPROVED' ? 'success' :
                  report.status === 'REJECTED' ? 'danger' : 'default'
                }>
                  {reportT(`status_${report.status}`)}
                </Badge>
              </div>

              <h2 className="font-semibold text-gray-900 mb-2">{report.title}</h2>
              <p className="text-gray-600 text-sm whitespace-pre-wrap mb-4">{report.description}</p>

              <div className="text-xs text-gray-500 space-y-1">
                <p>Reporter: {report.reporterName}</p>
                <p>Person: {report.personName}</p>
                <p>Submitted: {new Date(report.createdAt).toLocaleString()}</p>
                {report.severity && <p>Severity: {report.severity}/5</p>}
              </div>
            </div>
          </Card>

          {/* Evidence */}
          {report.evidences && report.evidences.length > 0 && (
            <Card>
              <div className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Evidence ({report.evidences.length})</h3>
                <div className="grid grid-cols-2 gap-3">
                  {report.evidences.map((ev: any) => (
                    <a
                      key={ev.id}
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.fileName}</p>
                      <p className="text-xs text-gray-500">{ev.type}</p>
                      {ev.caption && <p className="text-xs text-gray-500 mt-1">{ev.caption}</p>}
                    </a>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Review History */}
          {report.reviews && report.reviews.length > 0 && (
            <Card>
              <div className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Review History</h3>
                <ul className="space-y-2">
                  {report.reviews.map((review: any, i: number) => (
                    <li key={i} className="text-sm text-gray-600 border-l-2 border-gray-200 pl-3">
                      <span className="font-medium">{review.reviewerName}</span>:{' '}
                      {review.action} — {review.notes || 'No notes'}
                      <div className="text-xs text-gray-400">{new Date(review.createdAt).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar: Admin Actions */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24">
            <div className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">{t('review')}</h3>

              {!isReviewed ? (
                <div className="space-y-4">
                  {/* Score Deltas */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">{t('scoreDelta')}</h4>
                    <div className="space-y-1.5">
                      {CATEGORIES.map((cat) => (
                        <div key={cat} className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">{ratingT(`category.${cat}`)}</span>
                          <input
                            type="number"
                            min={-50}
                            max={50}
                            defaultValue={0}
                            className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-center text-xs"
                            onChange={(e) => setScoreDeltas(prev => ({
                              ...prev,
                              [cat]: Number(e.target.value) || 0,
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminNotes')}</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Optional notes..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="secondary"
                      size="md"
                      className="w-full"
                      onClick={handleApprove}
                      isLoading={reviewMutation.isPending}
                    >
                      {t('approve')}
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      className="w-full"
                      onClick={handleReject}
                      isLoading={reviewMutation.isPending}
                    >
                      {t('reject')}
                    </Button>
                  </div>

                  {reviewMutation.isError && (
                    <p className="text-sm text-red-500">
                      {(reviewMutation.error as Error).message}
                    </p>
                  )}
                  {reviewMutation.isSuccess && (
                    <p className="text-sm text-emerald-600">Review submitted successfully!</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    This report has been <strong>{report.status}</strong>.
                  </p>
                  {report.adminNotes && (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                      <p className="font-medium text-xs text-gray-500 mb-1">Admin Notes:</p>
                      {report.adminNotes}
                    </div>
                  )}
                  {report.rejectionReason && (
                    <div className="bg-red-50 rounded-lg p-3 text-sm text-red-600">
                      <p className="font-medium text-xs text-red-500 mb-1">Rejection Reason:</p>
                      {report.rejectionReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

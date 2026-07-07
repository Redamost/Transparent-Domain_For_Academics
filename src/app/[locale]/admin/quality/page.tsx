'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui';
import { DataIssuesList } from '@/components/admin/DataIssuesList';

interface QualityData {
  personCount: number;
  coverage: Record<string, { count: number; pct: string }>;
  content: Record<string, { personsWith: number; pct: string; totalRecords: number }>;
  sources: Record<string, number>;
  trends?: {
    lastWeek: { newPersons: number; newEnriched: number; newScraped: number };
  };
}

async function fetchQuality(): Promise<QualityData> {
  const res = await fetch('/api/admin/scraping/quality');
  if (!res.ok) throw new Error('Failed to fetch quality data');
  return res.json();
}

function ProgressBar({ pct, label }: { pct: string; label?: string }) {
  const value = parseFloat(pct);
  const color =
    value >= 60 ? 'bg-emerald-500' :
    value >= 30 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${Math.max(value, 2)}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-12 text-right">{pct}</span>
    </div>
  );
}

function MetricCard({
  label,
  count,
  total,
  pct,
  color,
}: {
  label: string;
  count: number;
  total: number;
  pct: string;
  color: 'emerald' | 'blue' | 'amber' | 'purple';
}) {
  const colorMap = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
  };

  return (
    <Card className="p-4">
      <div
        className={`text-2xl font-bold ${colorMap[color]}`}
        style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}
      >
        {count.toLocaleString()}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-xs text-gray-400">{pct} of {total.toLocaleString()}</span>
      </div>
    </Card>
  );
}

export default function AdminQualityPage() {
  const t = useTranslations('admin');
  const { data, isLoading, error } = useQuery({
    queryKey: ['adminQuality'],
    queryFn: fetchQuality,
    refetchInterval: 60_000, // Auto-refresh every 60s
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Data Quality</h1>
        <p className="text-sm text-gray-400">Loading quality metrics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Data Quality</h1>
        <Card className="p-6">
          <p className="text-sm text-red-500">Failed to load quality data. Ensure you are logged in as admin.</p>
        </Card>
      </div>
    );
  }

  const total = data.personCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Data Quality Dashboard</h1>
        <span className="text-xs text-gray-400">
          {total.toLocaleString()} active scholars · Auto-refreshes every 60s
        </span>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Scholars"
          count={total}
          total={total}
          pct="100%"
          color="blue"
        />
        <MetricCard
          label="Have hIndex"
          count={data.coverage.hIndex.count}
          total={total}
          pct={data.coverage.hIndex.pct}
          color="emerald"
        />
        <MetricCard
          label="Have Publications"
          count={data.content.publications.personsWith}
          total={total}
          pct={data.content.publications.pct}
          color="purple"
        />
        <MetricCard
          label="Have Department"
          count={data.coverage.department.count}
          total={total}
          pct={data.coverage.department.pct}
          color="amber"
        />
      </div>

      {/* Coverage Progress Bars */}
      <Card>
        <div className="p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Field Coverage</h2>
          <div className="space-y-3">
            {[
              { key: 'bio', label: 'Biography' },
              { key: 'email', label: 'Email' },
              { key: 'department', label: 'Department' },
              { key: 'title', label: 'Title' },
              { key: 'hIndex', label: 'h-Index' },
            ].map(({ key, label }) => {
              const d = data.coverage[key];
              return (
                <div key={key} className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 w-24">{label}</span>
                  <div className="flex-1 max-w-md">
                    <ProgressBar pct={d.pct} />
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right">{d.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Content Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Content Depth</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Content Type</th>
                  <th className="pb-2 font-medium text-right">Scholars With</th>
                  <th className="pb-2 font-medium text-right">%</th>
                  <th className="pb-2 font-medium text-right">Total Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { key: 'publications', label: 'Publications' },
                  { key: 'researchUpdates', label: 'Research Updates' },
                  { key: 'competitionUpdates', label: 'Competition Updates' },
                  { key: 'evaluationUpdates', label: 'Evaluation Updates' },
                ].map(({ key, label }) => {
                  const d = data.content[key];
                  return (
                    <tr key={key}>
                      <td className="py-2 text-gray-900">{label}</td>
                      <td className="py-2 text-right text-gray-600">{d.personsWith.toLocaleString()}</td>
                      <td className="py-2 text-right">
                        <span className={
                          parseFloat(d.pct) < 5 ? 'text-red-500' :
                          parseFloat(d.pct) < 15 ? 'text-amber-500' :
                          'text-emerald-500'
                        }>
                          {d.pct}
                        </span>
                      </td>
                      <td className="py-2 text-right text-gray-500">{d.totalRecords.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Source Distribution */}
        <Card>
          <div className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Data Sources</h2>
            <div className="space-y-3">
              {[
                { key: 'cnUniversity', label: 'CN University Scraping', color: 'bg-blue-500' },
                { key: 'openAlexEnriched', label: 'OpenAlex Enriched (hIndex)', color: 'bg-emerald-500' },
                { key: 'seed', label: 'Seed Data (manual)', color: 'bg-gray-400' },
              ].map(({ key, label, color }) => {
                const count = data.sources[key] || 0;
                const pct = total > 0 ? (count / total * 100).toFixed(1) : '0';
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded ${color}`} />
                    <span className="text-sm text-gray-600 flex-1">{label}</span>
                    <span className="text-sm text-gray-900 font-medium">{count.toLocaleString()}</span>
                    <span className="text-xs text-gray-400">{pct}%</span>
                  </div>
                );
              })}
            </div>

            {/* Data source note */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                <strong>CN University:</strong> scholars scraped from university faculty pages.<br />
                <strong>OpenAlex:</strong> scholars with hIndex enriched via OpenAlex API.<br />
                <strong>Seed:</strong> manually added baseline scholars.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <div className="p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Key Quality Gaps</h2>
          <div className="space-y-2">
            {(() => {
              const gaps: Array<{ label: string; severity: 'high' | 'medium' | 'low'; detail: string }> = [];

              const hPct = parseFloat(data.coverage.hIndex.pct);
              if (hPct < 20) {
                gaps.push({
                  label: 'hIndex Coverage',
                  severity: 'high',
                  detail: `Only ${data.coverage.hIndex.pct} of scholars have hIndex data. Run OpenAlex enrichment or the daily cron job.`,
                });
              }

              const compPct = parseFloat(data.content.competitionUpdates.pct);
              if (compPct < 5) {
                gaps.push({
                  label: 'Competition Updates',
                  severity: 'medium',
                  detail: `Only ${data.content.competitionUpdates.pct} have competition data. University pages rarely contain this information — consider alternative sources.`,
                });
              }

              const evalPct = parseFloat(data.content.evaluationUpdates.pct);
              if (evalPct < 5) {
                gaps.push({
                  label: 'Evaluation Updates',
                  severity: 'medium',
                  detail: `Only ${data.content.evaluationUpdates.pct} have evaluation data. Same limitation as competition data.`,
                });
              }

              const emailPct = parseFloat(data.coverage.email.pct);
              if (emailPct < 20) {
                gaps.push({
                  label: 'Email Coverage',
                  severity: 'low',
                  detail: `Only ${data.coverage.email.pct} have email addresses. Most Chinese university pages obfuscate or omit emails.`,
                });
              }

              const bioPct = parseFloat(data.coverage.bio.pct);
              if (bioPct < 30) {
                gaps.push({
                  label: 'Biography Coverage',
                  severity: 'low',
                  detail: `Only ${data.coverage.bio.pct} have biographies. JS-rendered pages may not yield bio text.`,
                });
              }

              return gaps.map(gap => (
                <div key={gap.label} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <span className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    gap.severity === 'high' ? 'bg-red-500' :
                    gap.severity === 'medium' ? 'bg-amber-500' :
                    'bg-blue-400'
                  }`} />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{gap.label}</span>
                    <span className={`ml-2 text-[10px] uppercase ${
                      gap.severity === 'high' ? 'text-red-500' :
                      gap.severity === 'medium' ? 'text-amber-500' :
                      'text-blue-400'
                    }`}>{gap.severity}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{gap.detail}</p>
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      </Card>

      {/* ─── Automated Data Quality Maintenance ─── */}
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-semibold text-gray-900">Automated Maintenance</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">NEW</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Periodically scans the database for garbage data, junk bios, duplicate persons, stale records, and other quality issues.
            Auto-fixable issues can be cleaned up automatically or reviewed manually.
          </p>
          <DataIssuesList />
        </div>
      </Card>
    </div>
  );
}

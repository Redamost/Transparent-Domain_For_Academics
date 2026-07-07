'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  Search,
  Trash2,
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  UserX,
  FileWarning,
  Clock,
  RefreshCw,
  Play,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// ─── Types ───

interface ScanResult {
  scannedAt: string;
  totalPersons: number;
  totalIssues: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  issues: DataIssueItem[];
  autoFixable: number;
  needsReview: number;
}

interface DataIssueItem {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  entityType: string;
  entityId: string;
  summary: string;
  detail: Record<string, unknown>;
  suggestedAction: 'AUTO_FIX' | 'REVIEW' | 'NOTIFY';
}

interface CleanupResult {
  executedAt: string;
  dryRun: boolean;
  totalActions: number;
  succeeded: number;
  failed: number;
  actions: CleanupActionItem[];
  summary: string;
}

interface CleanupActionItem {
  issueType: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  success: boolean;
  error?: string;
}

// ─── Constants ───

const ISSUE_TYPE_LABELS: Record<string, string> = {
  GARBAGE_NAME: 'Garbage Names',
  JUNK_BIO: 'Junk Bios',
  INCOMPLETE_PROFILE: 'Incomplete Profiles',
  DUPLICATE_PERSON: 'Duplicates',
  STALE_DATA: 'Stale Data',
  ORPHANED_RECORD: 'Orphaned Records',
  SUSPICIOUS_SCORE: 'Suspicious Scores',
  EMPTY_FIELDS: 'Empty Fields',
  INACTIVE_WITH_CONTENT: 'Inactive w/ Content',
};

const SEVERITY_ICONS: Record<string, typeof AlertOctagon> = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-600 bg-red-50 border-red-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-blue-600 bg-blue-50 border-blue-200',
};

// ─── API Calls ───

async function fetchScan(): Promise<ScanResult> {
  const res = await fetch('/api/admin/data-quality/scan');
  if (!res.ok) throw new Error('Scan failed');
  return res.json();
}

async function fetchIssues(): Promise<{
  recentActivity: Array<{ id: string; action: string; entityType: string; data: unknown; timestamp: string }>;
  summary: { totalDeactivated: number; totalOrphanCleanups: number; lastScan: unknown };
}> {
  const res = await fetch('/api/admin/data-quality/issues');
  if (!res.ok) throw new Error('Failed to fetch issues');
  return res.json();
}

async function runCleanup(dryRun: boolean): Promise<CleanupResult> {
  const res = await fetch('/api/admin/data-quality/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun }),
  });
  if (!res.ok) throw new Error('Cleanup failed');
  return res.json();
}

// ─── Component ───

export function DataIssuesList() {
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [showCleanupResult, setShowCleanupResult] = useState<CleanupResult | null>(null);

  // Fetch latest scan
  const {
    data: scanResult,
    isLoading: scanLoading,
    error: scanError,
    refetch: refetchScan,
  } = useQuery({
    queryKey: ['dataQualityScan'],
    queryFn: fetchScan,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Fetch issue history
  const {
    data: issueHistory,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ['dataQualityIssues'],
    queryFn: fetchIssues,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: runCleanup,
    onSuccess: (result) => {
      setShowCleanupResult(result);
      queryClient.invalidateQueries({ queryKey: ['dataQualityScan'] });
      queryClient.invalidateQueries({ queryKey: ['dataQualityIssues'] });
    },
  });

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Group issues by type
  const issuesByType = scanResult?.issues
    ? scanResult.issues.reduce((acc, issue) => {
        if (!acc[issue.type]) acc[issue.type] = [];
        acc[issue.type].push(issue);
        return acc;
      }, {} as Record<string, DataIssueItem[]>)
    : {};

  const isLoading: boolean = scanLoading || historyLoading;

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => refetchScan()}
          disabled={scanLoading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
        >
          <Search className="w-4 h-4" />
          {scanLoading ? 'Scanning...' : 'Scan Now'}
        </button>

        <button
          onClick={() => cleanupMutation.mutate(true)}
          disabled={cleanupMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <ShieldCheck className="w-4 h-4" />
          {cleanupMutation.isPending ? 'Running...' : 'Dry-Run Cleanup'}
        </button>

        <button
          onClick={() => {
            if (confirm('This will permanently modify data. Continue?')) {
              cleanupMutation.mutate(false);
            }
          }}
          disabled={cleanupMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Execute Cleanup
        </button>

        {scanResult && (
          <span className="text-xs text-gray-400 ml-2">
            Last scan: {new Date(scanResult.scannedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Error State */}
      {scanError && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-600">
            Failed to run scan. Ensure you are logged in as admin.
          </p>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && !scanResult && (
        <Card className="p-6">
          <div className="flex items-center gap-3 text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Running data quality scan...</span>
          </div>
        </Card>
      )}

      {/* Scan Summary */}
      {scanResult && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-gray-800">{scanResult.totalIssues}</div>
              <div className="text-xs text-gray-500">Total Issues</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{scanResult.bySeverity.critical || 0}</div>
              <div className="text-xs text-gray-500">Critical</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">{scanResult.bySeverity.high || 0}</div>
              <div className="text-xs text-gray-500">High</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{scanResult.bySeverity.medium || 0}</div>
              <div className="text-xs text-gray-500">Medium</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{scanResult.bySeverity.low || 0}</div>
              <div className="text-xs text-gray-500">Low</div>
            </Card>
          </div>

          {/* Auto-fixable & Review badges */}
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Play className="w-3 h-3" />
              {scanResult.autoFixable} auto-fixable
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-50 text-purple-700 border border-purple-200">
              <FileWarning className="w-3 h-3" />
              {scanResult.needsReview} need review
            </span>
          </div>

          {/* Issues by Type */}
          {Object.keys(issuesByType).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(issuesByType).map(([type, issues]) => {
                const isExpanded = expandedTypes.has(type);
                const severityCount = issues.reduce((acc, i) => {
                  acc[i.severity] = (acc[i.severity] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                return (
                  <Card key={type} className="overflow-hidden">
                    <button
                      onClick={() => toggleType(type)}
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-gray-400" />
                          : <ChevronRight className="w-4 h-4 text-gray-400" />
                        }
                        <span className="font-medium text-gray-900 text-sm">
                          {ISSUE_TYPE_LABELS[type] || type}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {issues.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {Object.entries(severityCount).map(([sev, count]) => {
                          const SevIcon = SEVERITY_ICONS[sev] || Info;
                          return (
                            <span
                              key={sev}
                              className={cn('inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded', SEVERITY_COLORS[sev] || '')}
                            >
                              <SevIcon className="w-3 h-3" />
                              {count}
                            </span>
                          );
                        })}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t divide-y divide-gray-100 max-h-96 overflow-y-auto">
                        {issues.slice(0, 50).map((issue, idx) => {
                          const SevIcon = SEVERITY_ICONS[issue.severity] || Info;
                          return (
                            <div
                              key={`${issue.entityId}-${idx}`}
                              className="px-4 py-2.5 flex items-start gap-3 hover:bg-gray-25"
                            >
                              <SevIcon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', {
                                'text-red-500': issue.severity === 'critical',
                                'text-orange-500': issue.severity === 'high',
                                'text-amber-500': issue.severity === 'medium',
                                'text-blue-400': issue.severity === 'low',
                              })} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800">{issue.summary}</p>
                                {issue.detail && (
                                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                                    {typeof issue.detail.reason === 'string'
                                      ? issue.detail.reason
                                      : JSON.stringify(issue.detail).slice(0, 120)}
                                  </p>
                                )}
                              </div>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0', {
                                'bg-emerald-50 text-emerald-600 border border-emerald-200': issue.suggestedAction === 'AUTO_FIX',
                                'bg-purple-50 text-purple-600 border border-purple-200': issue.suggestedAction === 'REVIEW',
                                'bg-blue-50 text-blue-600 border border-blue-200': issue.suggestedAction === 'NOTIFY',
                              })}>
                                {issue.suggestedAction === 'AUTO_FIX' ? 'Auto' : issue.suggestedAction === 'REVIEW' ? 'Review' : 'Notify'}
                              </span>
                            </div>
                          );
                        })}
                        {issues.length > 50 && (
                          <div className="px-4 py-2 text-xs text-gray-400 text-center">
                            +{issues.length - 50} more issues (limit reached)
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <div className="text-emerald-600 text-lg mb-1">✓</div>
              <p className="text-sm text-gray-600 font-medium">No issues found</p>
              <p className="text-xs text-gray-400 mt-1">Database quality looks good</p>
            </Card>
          )}
        </>
      )}

      {/* Cleanup Result Modal */}
      {showCleanupResult && (
        <Card className={cn(
          'p-4 border-2',
          showCleanupResult.dryRun ? 'border-blue-200 bg-blue-50/50' : 'border-emerald-200 bg-emerald-50/50'
        )}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 text-sm">
              {showCleanupResult.dryRun ? '🔍 Cleanup Dry-Run Result' : '✅ Cleanup Executed'}
            </h3>
            <button
              onClick={() => setShowCleanupResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-2">{showCleanupResult.summary}</p>
          <div className="flex gap-4 text-sm">
            <span className="text-emerald-600">{showCleanupResult.succeeded} succeeded</span>
            {showCleanupResult.failed > 0 && (
              <span className="text-red-600">{showCleanupResult.failed} failed</span>
            )}
          </div>
          {showCleanupResult.actions.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto divide-y divide-gray-100 border-t pt-2">
              {showCleanupResult.actions.slice(0, 20).map((action, idx) => (
                <div key={idx} className="py-1.5 flex items-start gap-2">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0',
                    action.success ? 'bg-emerald-500' : 'bg-red-500'
                  )} />
                  <span className="text-xs text-gray-600">{action.description}</span>
                </div>
              ))}
              {showCleanupResult.actions.length > 20 && (
                <div className="py-1 text-xs text-gray-400 text-center">
                  +{showCleanupResult.actions.length - 20} more actions
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Issue History */}
      {issueHistory && issueHistory.summary.lastScan && (
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Recent Activity
          </h3>
          <div className="space-y-2">
            {issueHistory.recentActivity.slice(0, 10).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  <span className="font-medium text-gray-800">{entry.action.replace(/_/g, ' ')}</span>
                  <span className="text-gray-400 ml-2">• {entry.entityType}</span>
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

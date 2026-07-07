'use client';

import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  taskType: string;
  expReward: number;
  assignedAt: string;
  completedAt?: string;
  fieldId?: string;
}

interface TaskCompleteResult {
  task: Task;
  levelProgress?: {
    level: number;
    currentExp: number;
    nextLevelExp: number;
    progress: number;
    levelInfo: { nameZh: string; nameEn: string; icon: string; color: string };
  } | null;
  expGained?: number;
  streak?: number;
}

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch('/api/dashboard/tasks');
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

async function completeTask(taskId: string): Promise<TaskCompleteResult> {
  const res = await fetch(`/api/dashboard/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'COMPLETED' }),
  });
  if (!res.ok) throw new Error('Failed to complete task');
  return res.json();
}

const taskTypeLabels: Record<string, { zh: string; en: string; color: string }> = {
  MONITOR: { zh: '监控', en: 'Monitor', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  REPORT: { zh: '报告', en: 'Report', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  REVIEW: { zh: '审核', en: 'Review', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  VERIFY: { zh: '核实', en: 'Verify', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

export function TaskList() {
  const t = useTranslations('community');
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['dashboardTasks'],
    queryFn: fetchTasks,
  });

  const mutation = useMutation({
    mutationFn: completeTask,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['communityProfile'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 animate-pulse">
            <div className="h-4 bg-white/[0.05] rounded w-3/4 mb-2" />
            <div className="h-3 bg-white/[0.03] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-white/30">{t('allTasksDone')}</p>
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.status !== 'PENDING').length;
  const allDone = completedCount === tasks.length;

  return (
    <div className="space-y-3">
      {allDone && (
        <div className="text-center py-3">
          <p className="text-sm text-emerald-400/80">✓ {t('allTasksCompleted')}</p>
        </div>
      )}
      {tasks.map((task) => {
        const typeInfo = taskTypeLabels[task.taskType] || taskTypeLabels.MONITOR;
        const isDone = task.status !== 'PENDING';
        const isCompleting = mutation.variables === task.id && mutation.isPending;

        return (
          <div
            key={task.id}
            className={cn(
              'rounded-lg border p-4 transition-all duration-300',
              isDone
                ? 'border-emerald-500/15 bg-emerald-500/[0.02]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
                      typeInfo.color
                    )}
                  >
                    {typeInfo.zh}
                  </span>
                  <span className="text-xs text-amber-400/70">
                    +{task.expReward} EXP
                  </span>
                </div>
                <p
                  className={cn(
                    'text-sm font-medium',
                    isDone ? 'text-white/50' : 'text-white/80'
                  )}
                >
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-xs text-white/25 mt-1 line-clamp-2">{task.description}</p>
                )}
                {task.completedAt && (
                  <p className="text-xs text-emerald-400/60 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {t('completedAt')}: {new Date(task.completedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>

              {isDone ? (
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-400" />
                </span>
              ) : (
                <button
                  onClick={() => mutation.mutate(task.id)}
                  disabled={mutation.isPending}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                    'bg-white/[0.06] border border-white/[0.10] text-white/60',
                    'hover:bg-white/[0.10] hover:text-white/80 hover:border-white/[0.20]',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {isCompleting ? '...' : t('taskComplete')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

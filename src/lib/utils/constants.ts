export const LOCALES = ['zh', 'en'] as const;
export const DEFAULT_LOCALE = 'zh';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const ITEMS_PER_PAGE = 20;
export const MAX_REPORTS_PER_DAY = 5;
export const MAX_REPORTS_PER_PERSON_PER_WEEK = 2;
export const REPORT_REJECTION_WARNING_THRESHOLD = 0.3; // 30%
export const REPORT_REJECTION_MIN_COUNT = 20;

export const BASELINE_SCORE = 100.0;
export const MAX_SINGLE_REPORT_DELTA = 50;

export const RATING_CATEGORY_WEIGHTS = {
  RESEARCH_QUALITY: 0.3,
  METHODOLOGY_RIGOR: 0.25,
  COLLABORATION_ETHICS: 0.15,
  CITATION_INTEGRITY: 0.15,
  PEER_RECOGNITION: 0.1,
  COMMUNITY_FEEDBACK: 0.05,
} as const;

export const SCORE_COLORS = {
  excellent: 'text-emerald-400',   // >110
  good: 'text-blue-400',           // 100-110
  fair: 'text-amber-400',          // 85-100
  poor: 'text-orange-400',         // 70-85
  critical: 'text-red-400',        // <70
} as const;

export const SCORE_COLOR_VALUES: Record<string, string> = {
  'text-emerald-400': '#34d399',
  'text-blue-400': '#60a5fa',
  'text-amber-400': '#fbbf24',
  'text-orange-400': '#fb923c',
  'text-red-400': '#f87171',
};


export function getScoreColor(score: number): string {
  if (score > 110) return SCORE_COLORS.excellent;
  if (score >= 100) return SCORE_COLORS.good;
  if (score >= 85) return SCORE_COLORS.fair;
  if (score >= 70) return SCORE_COLORS.poor;
  return SCORE_COLORS.critical;
}

// ═══════════════════════════════════════════
// 透明等级系统 (Transparency Level System)
// ═══════════════════════════════════════════

export const TRANSPARENCY_LEVELS = [
  { level: 1, nameZh: '观察者', nameEn: 'Observer', requiredExp: 0, icon: '👁️', color: 'text-gray-400' },
  { level: 2, nameZh: '监督者', nameEn: 'Supervisor', requiredExp: 100, icon: '🔍', color: 'text-green-400' },
  { level: 3, nameZh: '守护者', nameEn: 'Guardian', requiredExp: 300, icon: '🛡️', color: 'text-blue-400' },
  { level: 4, nameZh: '裁决者', nameEn: 'Arbiter', requiredExp: 600, icon: '⚖️', color: 'text-purple-400' },
  { level: 5, nameZh: '透明使者', nameEn: 'Transparency Envoy', requiredExp: 1000, icon: '💎', color: 'text-amber-400' },
] as const;

export const EXP_REWARDS = {
  TASK_COMPLETED: 10,
  REPORT_SUBMITTED: 15,
  REPORT_APPROVED: 30,
  REPORT_APPROVED_HIGH_IMPACT: 50,
  STREAK_BONUS_3: 20,
  STREAK_BONUS_7: 50,
  STREAK_BONUS_30: 200,
} as const;

export const HOTSPOT_WEIGHTS = {
  REPORT_COUNT: 0.35,
  AVG_SEVERITY: 0.25,
  RECENCY_DAYS: 0.20,
  SCORE_IMPACT: 0.20,
} as const;

export const HOTSPOT_MIN_REPORTS = 2; // 至少被举报2次才进入污点热点
export const HOTSPOT_LOOKBACK_DAYS = 30; // 热点回顾天数

import { HOTSPOT_WEIGHTS, HOTSPOT_LOOKBACK_DAYS } from '@/lib/utils/constants';

interface StainScoreParams {
  reportCount: number;
  avgSeverity: number;
  recencyDays: number;
  scoreDelta: number;
}

interface HighlightScoreParams {
  score: number;
  recentAchievements: number;
  communityVotes: number;
}

/**
 * 计算"学术污点"热度分数
 * 权重: 举报数35% + 严重度25% + 时效性20% + 评分影响20%
 */
export function calculateStainScore(params: StainScoreParams): number {
  const { reportCount, avgSeverity, recencyDays, scoreDelta } = params;

  const reportScore = Math.log2(reportCount + 1) / Math.log2(11); // 归一化到0-1 (假设最多~10次举报)
  const severityScore = (avgSeverity || 1) / 5; // 归一化到0-1
  const recencyScore = Math.max(0, 1 - recencyDays / HOTSPOT_LOOKBACK_DAYS); // 越近越高
  const impactScore = Math.min(1, Math.abs(scoreDelta) / 50); // 评分变动归一化

  const total =
    HOTSPOT_WEIGHTS.REPORT_COUNT * reportScore +
    HOTSPOT_WEIGHTS.AVG_SEVERITY * severityScore +
    HOTSPOT_WEIGHTS.RECENCY_DAYS * recencyScore +
    HOTSPOT_WEIGHTS.SCORE_IMPACT * impactScore;

  return Math.round(total * 100) / 100; // 保留2位小数
}

/**
 * 计算"学术亮点"热度分数
 */
export function calculateHighlightScore(params: HighlightScoreParams): number {
  const { score, recentAchievements, communityVotes } = params;

  const scoreNormalized = Math.min(1, Math.max(0, (score - 70) / 60)); // 70-130 → 0-1
  const achievementsScore = Math.min(1, recentAchievements / 5); // 最多5项
  const votesScore = Math.min(1, communityVotes / 10); // 最多10票

  const total = 0.4 * scoreNormalized + 0.35 * achievementsScore + 0.25 * votesScore;

  return Math.round(total * 100) / 100;
}

/**
 * 计算时效性加权分数（天数越近权重越高）
 */
export function getRecencyWeight(daysAgo: number): number {
  if (daysAgo <= 1) return 1.0;
  if (daysAgo <= 3) return 0.9;
  if (daysAgo <= 7) return 0.75;
  if (daysAgo <= 14) return 0.55;
  if (daysAgo <= 30) return 0.35;
  return 0.1;
}

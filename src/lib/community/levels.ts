import { TRANSPARENCY_LEVELS, EXP_REWARDS } from '@/lib/utils/constants';

export interface LevelInfo {
  level: number;
  nameZh: string;
  nameEn: string;
  requiredExp: number;
  icon: string;
  color: string;
}

export interface LevelProgress {
  level: number;
  currentExp: number;
  nextLevelExp: number;
  progress: number; // 0-100
  levelInfo: LevelInfo;
  nextLevelInfo: LevelInfo | null;
}

/**
 * 根据总经验值计算当前等级和进度
 */
export function calculateLevel(totalExp: number): LevelProgress {
  const levels = TRANSPARENCY_LEVELS as unknown as LevelInfo[];

  let currentLevel = levels[0];
  let nextLevel: LevelInfo | null = levels[1] || null;

  for (let i = levels.length - 1; i >= 0; i--) {
    if (totalExp >= levels[i].requiredExp) {
      currentLevel = levels[i];
      nextLevel = levels[i + 1] || null;
      break;
    }
  }

  const currentLevelExp = currentLevel.requiredExp;
  const nextLevelExp = nextLevel ? nextLevel.requiredExp : currentLevel.requiredExp;
  const expInLevel = totalExp - currentLevelExp;
  const expNeeded = nextLevelExp - currentLevelExp;
  const progress = nextLevel ? Math.min(100, Math.round((expInLevel / expNeeded) * 100)) : 100;

  return {
    level: currentLevel.level,
    currentExp: totalExp,
    nextLevelExp,
    progress,
    levelInfo: currentLevel,
    nextLevelInfo: nextLevel,
  };
}

/**
 * 获取指定等级的信息
 */
export function getLevelInfo(level: number): LevelInfo {
  const levels = TRANSPARENCY_LEVELS as unknown as LevelInfo[];
  const idx = Math.min(level - 1, levels.length - 1);
  return levels[Math.max(0, idx)];
}

/**
 * 计算报告准确率
 */
export function calculateAccuracy(approved: number, rejected: number): number {
  const total = approved + rejected;
  if (total === 0) return 0;
  return Math.round((approved / total) * 100) / 100;
}

/**
 * 计算完成任务可获得的经验值
 */
export function getTaskExpReward(taskType: string): number {
  switch (taskType) {
    case 'REVIEW':
      return EXP_REWARDS.TASK_COMPLETED * 2;
    case 'VERIFY':
      return EXP_REWARDS.TASK_COMPLETED * 3;
    default:
      return EXP_REWARDS.TASK_COMPLETED;
  }
}

/**
 * 计算连续活跃天数的奖励经验
 */
export function getStreakBonusExp(streak: number): number {
  if (streak >= 30) return EXP_REWARDS.STREAK_BONUS_30;
  if (streak >= 7) return EXP_REWARDS.STREAK_BONUS_7;
  if (streak >= 3) return EXP_REWARDS.STREAK_BONUS_3;
  return 0;
}

/**
 * 计算升级到下一级所需的总经验
 */
export function getExpToNextLevel(currentLevel: number, currentExp: number): number {
  const nextLevelInfo = getLevelInfo(currentLevel + 1);
  if (!nextLevelInfo || nextLevelInfo.requiredExp <= getLevelInfo(currentLevel).requiredExp) {
    return 0;
  }
  return Math.max(0, nextLevelInfo.requiredExp - currentExp);
}

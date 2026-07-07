/**
 * Time-based decay factor for rating log entries.
 * Recent reports have more weight; older reports gradually lose influence.
 */

export function timeDecayFactor(reportDate: Date): number {
  const now = new Date();
  const ageInMonths = differenceInMonths(now, reportDate);

  if (ageInMonths <= 6) return 1.0;
  if (ageInMonths <= 12) return 0.85;
  if (ageInMonths <= 24) return 0.70;
  if (ageInMonths <= 36) return 0.50;
  return 0.30;
}

function differenceInMonths(date1: Date, date2: Date): number {
  const yearDiff = date1.getFullYear() - date2.getFullYear();
  const monthDiff = date1.getMonth() - date2.getMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * Calculate the effective weighted delta for a rating log entry,
 * applying time decay to its delta value.
 */
export function effectiveDelta(delta: number, createdAt: Date): number {
  return delta * timeDecayFactor(createdAt);
}

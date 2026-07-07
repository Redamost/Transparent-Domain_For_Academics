// ─── Data Quality Scanner ───
// Periodically scans the database for data quality issues:
// garbage names, junk bios, incomplete profiles, duplicates,
// stale data, orphaned records, and suspicious scores.
//
// Each scan function returns an array of detected issues with
// severity, suggested action, and supporting evidence.

import { prisma } from '@/lib/prisma';

// ─── Types ───

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueType =
  | 'GARBAGE_NAME'
  | 'JUNK_BIO'
  | 'INCOMPLETE_PROFILE'
  | 'DUPLICATE_PERSON'
  | 'STALE_DATA'
  | 'ORPHANED_RECORD'
  | 'SUSPICIOUS_SCORE'
  | 'EMPTY_FIELDS'
  | 'INACTIVE_WITH_CONTENT';

export interface DataIssue {
  type: IssueType;
  severity: IssueSeverity;
  entityType: 'PERSON' | 'PUBLICATION' | 'RESEARCH_UPDATE' | 'COMPETITION_UPDATE' | 'EVALUATION_UPDATE';
  entityId: string;
  summary: string;           // One-line description in English
  detail: Record<string, unknown>; // Machine-readable evidence
  suggestedAction: 'AUTO_FIX' | 'REVIEW' | 'NOTIFY';
}

export interface ScanResult {
  scannedAt: string;
  totalPersons: number;
  totalIssues: number;
  byType: Record<IssueType, number>;
  bySeverity: Record<IssueSeverity, number>;
  issues: DataIssue[];
  autoFixable: number;
  needsReview: number;
}

// ─── Garbage detection patterns ───

/** Phrases that indicate scraped navigation/UI garbage rather than real content */
const GARBAGE_PATTERNS = [
  /^首页$/,
  /^登录$/,
  /^注册$/,
  /^返回$/,
  /^导航$/,
  /^菜单$/,
  /首页$/,
  /^<[^>]+>.*<\/[^>]+>$/,     // HTML tags
  /^(Home|Login|Register|Back|Menu|Search|Contact|About)$/i,
  /^(null|undefined|unknown|test|测试|无|暂无|匿名)$/i,
  /^\d+$/,                     // Only numbers
  /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/, // Only symbols
  /^(姓名|名字|名称|人员|教师|老师|教授|学生)$/, // Generic labels
  /^[\x00-\x1F\x7F-\x9F]+$/,  // Control characters
  /(?:[A-Za-z0-9+\/]{40,}={0,2})/, // Base64 (unlikely in names)
];

/** Known navigation/site-chrome text that shouldn't be in bios */
const BIO_GARBAGE_PATTERNS = [
  /^<[^>]+>.*<\/[^>]+>/,       // HTML tags
  /<div|<span|<p|<a\s|<li|<ul|<table/, // HTML fragments
  /&[a-z]+;/,                   // HTML entities
  /^\{.*\}$/,                   // JSON objects
  /^\[.*\]$/,                   // JSON arrays
  /^\s*$/m,                     // Only whitespace
  /^.{1000,}$/,                 // Excessively long (>1000 chars)
  /^(首页|网站首页|学校首页|学院首页|部门首页)/, // Chinese nav text
  /^(Copyright|©|All Rights Reserved|版权所有)/i,
  /^function\s*\(/,             // JavaScript
  /^import\s+|^export\s+|^require\(/, // Code
];

/** Minimum thresholds */
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 80;
const STALE_DAYS = 90;           // Consider data stale after 90 days
const ORPHAN_CLEANUP_DAYS = 30;  // Can auto-clean orphans from persons inactive >30 days

// ─── Scanner Functions ───

/**
 * Detect garbage/junk names in Person records.
 * Returns persons whose nameZh or nameEn matches known garbage patterns.
 */
export async function scanGarbageNames(): Promise<DataIssue[]> {
  // Fetch active persons — we scan in JS since Prisma JSONB path queries are limited
  const persons = await prisma.person.findMany({
    where: { isActive: true },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      title: true,
      institution: true,
      hIndex: true,
      publicationCount: true,
    },
  });

  const issues: DataIssue[] = [];

  for (const p of persons) {
    const nameZh = p.nameZh || '';
    const nameEn = p.nameEn || '';

    // Check nameZh
    let reason = '';
    for (const pattern of GARBAGE_PATTERNS) {
      if (pattern.test(nameZh)) {
        reason = `nameZh "${nameZh}" matches garbage pattern: ${pattern}`;
        break;
      }
    }
    if (!reason && nameZh.length < MIN_NAME_LENGTH) {
      reason = `nameZh too short (${nameZh.length} chars): "${nameZh}"`;
    }
    if (!reason && nameZh.length > MAX_NAME_LENGTH) {
      reason = `nameZh too long (${nameZh.length} chars)`;
    }

    // Check nameEn if nameZh is fine
    if (!reason && nameEn) {
      for (const pattern of GARBAGE_PATTERNS) {
        if (pattern.test(nameEn)) {
          reason = `nameEn "${nameEn}" matches garbage pattern: ${pattern}`;
          break;
        }
      }
    }

    if (reason) {
      const hasData = (p.hIndex !== null && p.hIndex > 0) || (p.publicationCount !== null && p.publicationCount > 0);
      issues.push({
        type: 'GARBAGE_NAME',
        severity: hasData ? 'medium' : 'high', // Less severe if they have real academic data
        entityType: 'PERSON',
        entityId: p.id,
        summary: `Garbage name detected: ${nameZh || nameEn}`,
        detail: {
          nameZh,
          nameEn,
          institution: p.institution,
          reason,
          hasAcademicData: hasData,
        },
        suggestedAction: hasData ? 'REVIEW' : 'AUTO_FIX',
      });
    }
  }

  return issues;
}

/**
 * Detect junk biographies — HTML fragments, navigation text, code, etc.
 */
export async function scanJunkBios(): Promise<DataIssue[]> {
  const persons = await prisma.person.findMany({
    where: {
      isActive: true,
      OR: [
        { bioZh: { not: null } },
      ],
    },
    select: {
      id: true,
      nameZh: true,
      bioZh: true,
      bioEn: true,
    },
  });

  const issues: DataIssue[] = [];

  for (const p of persons) {
    const bio = p.bioZh || '';
    if (!bio || bio.length < 10) continue;

    let reason = '';
    for (const pattern of BIO_GARBAGE_PATTERNS) {
      if (pattern.test(bio)) {
        reason = `Bio matches garbage pattern: ${pattern}`;
        break;
      }
    }

    if (reason) {
      // Calculate info density: ratio of CJK + alphanumeric chars to total length
      const meaningful = (bio.match(/[一-鿿㐀-䶿a-zA-Z0-9]/g) || []).length;
      const density = meaningful / bio.length;

      issues.push({
        type: 'JUNK_BIO',
        severity: density < 0.3 ? 'high' : 'medium',
        entityType: 'PERSON',
        entityId: p.id,
        summary: `Junk bio for ${p.nameZh}: density=${(density * 100).toFixed(0)}%`,
        detail: {
          nameZh: p.nameZh,
          bioPreview: bio.slice(0, 200),
          bioLength: bio.length,
          infoDensity: density,
          reason,
        },
        suggestedAction: density < 0.3 ? 'AUTO_FIX' : 'REVIEW',
      });
    }
  }

  return issues;
}

/**
 * Detect incomplete profiles — persons missing critical fields.
 * Critical: nameEn, title, department, email, bio, hIndex
 * Severity based on how many missing.
 */
export async function scanIncompleteProfiles(): Promise<DataIssue[]> {
  const persons = await prisma.person.findMany({
    where: {
      isActive: true,
      metadata: { path: ['source'], not: 'seed' }, // Skip seed data
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      title: true,
      department: true,
      email: true,
      bioZh: true,
      hIndex: true,
      institution: true,
    },
  });

  const issues: DataIssue[] = [];
  const CRITICAL_FIELDS = ['nameEn', 'title', 'department', 'email', 'bioZh', 'hIndex'] as const;

  for (const p of persons) {
    const missing: string[] = [];
    if (!p.nameEn) missing.push('nameEn');
    if (!p.title) missing.push('title');
    if (!p.department) missing.push('department');
    if (!p.email) missing.push('email');
    if (!p.bioZh) missing.push('bioZh');
    if (p.hIndex === null) missing.push('hIndex');

    // Only flag if 3+ critical fields missing
    if (missing.length >= 3) {
      issues.push({
        type: 'INCOMPLETE_PROFILE',
        severity: missing.length >= 5 ? 'high' : missing.length >= 4 ? 'medium' : 'low',
        entityType: 'PERSON',
        entityId: p.id,
        summary: `${p.nameZh} missing ${missing.length} critical fields: ${missing.join(', ')}`,
        detail: {
          nameZh: p.nameZh,
          institution: p.institution,
          missingFields: missing,
          missingCount: missing.length,
        },
        suggestedAction: 'NOTIFY',
      });
    }
  }

  return issues;
}

/**
 * Detect potential duplicate persons — same nameZh + institution.
 */
export async function scanDuplicatePersons(): Promise<DataIssue[]> {
  // Find groups of persons with identical nameZh + institution
  const duplicates = await prisma.$queryRaw<Array<{
    namezh: string;
    institution: string;
    ids: string;
    count: bigint;
  }>>`
    SELECT
      "nameZh" as namezh,
      "institution",
      array_agg("id") as ids,
      COUNT(*) as count
    FROM "Person"
    WHERE "isActive" = true
      AND "nameZh" IS NOT NULL
      AND "institution" IS NOT NULL
    GROUP BY "nameZh", "institution"
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 100
  `;

  const issues: DataIssue[] = [];

  for (const group of duplicates) {
    const idList = (group.ids as unknown as string[]).slice(0, 10); // Max 10 ids

    // Get brief info for each duplicate
    const dupPersons = await prisma.person.findMany({
      where: { id: { in: idList } },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        title: true,
        department: true,
        hIndex: true,
        publicationCount: true,
        lastScrapedAt: true,
        score: true,
      },
    });

    issues.push({
      type: 'DUPLICATE_PERSON',
      severity: 'high',
      entityType: 'PERSON',
      entityId: idList[0], // Primary — the first one
      summary: `Duplicate: ${group.namezh} @ ${group.institution} — ${Number(group.count)} copies`,
      detail: {
        nameZh: group.namezh,
        institution: group.institution,
        duplicateCount: Number(group.count),
        duplicateIds: idList,
        persons: dupPersons.map(p => ({
          id: p.id,
          nameEn: p.nameEn,
          title: p.title,
          department: p.department,
          hIndex: p.hIndex,
          publicationCount: p.publicationCount,
          score: p.score,
          lastScrapedAt: p.lastScrapedAt,
        })),
      },
      suggestedAction: 'REVIEW',
    });
  }

  return issues;
}

/**
 * Detect stale data — active persons not updated in a long time.
 * More severe for persons with external IDs (should be maintained).
 */
export async function scanStaleData(): Promise<DataIssue[]> {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const stalePersons = await prisma.person.findMany({
    where: {
      isActive: true,
      metadata: { path: ['source'], not: 'seed' },
      OR: [
        { lastScrapedAt: null },
        { lastScrapedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      lastScrapedAt: true,
      orcidId: true,
      googleScholarId: true,
      hIndex: true,
      score: true,
    },
    orderBy: { lastScrapedAt: { sort: 'asc', nulls: 'first' } },
    take: 200,
  });

  return stalePersons.map(p => {
    const daysAgo = p.lastScrapedAt
      ? Math.floor((Date.now() - p.lastScrapedAt.getTime()) / (24 * 60 * 60 * 1000))
      : Infinity;
    const hasExternalId = !!(p.orcidId || p.googleScholarId);

    return {
      type: 'STALE_DATA' as IssueType,
      severity: (daysAgo > 180 || daysAgo === Infinity) ? 'high' : 'medium' as IssueSeverity,
      entityType: 'PERSON' as const,
      entityId: p.id,
      summary: `${p.nameZh || p.nameEn} not updated in ${daysAgo === Infinity ? '∞' : daysAgo} days`,
      detail: {
        nameZh: p.nameZh,
        nameEn: p.nameEn,
        institution: p.institution,
        lastScrapedAt: p.lastScrapedAt?.toISOString() || null,
        daysSinceUpdate: daysAgo === Infinity ? null : daysAgo,
        hasExternalId,
        hIndex: p.hIndex,
        score: p.score,
      },
      suggestedAction: hasExternalId ? 'NOTIFY' : 'REVIEW',
    };
  });
}

/**
 * Detect orphaned records — publications/updates linked to inactive persons.
 */
export async function scanOrphanedRecords(): Promise<DataIssue[]> {
  const issues: DataIssue[] = [];

  // Find inactive person IDs
  const inactivePersonIds = await prisma.person.findMany({
    where: { isActive: false },
    select: { id: true },
  });

  const ids = inactivePersonIds.map(p => p.id);

  if (ids.length === 0) return issues;

  // Count orphaned records per type
  const [orphanPubs, orphanResearch, orphanComp, orphanEval] = await Promise.all([
    prisma.publication.count({ where: { personId: { in: ids } } }),
    prisma.researchUpdate.count({ where: { personId: { in: ids } } }),
    prisma.competitionUpdate.count({ where: { personId: { in: ids } } }),
    prisma.evaluationUpdate.count({ where: { personId: { in: ids } } }),
  ]);

  const total = orphanPubs + orphanResearch + orphanComp + orphanEval;

  if (total > 0) {
    issues.push({
      type: 'ORPHANED_RECORD',
      severity: total > 100 ? 'high' : total > 10 ? 'medium' : 'low',
      entityType: 'PERSON', // Root cause
      entityId: 'SYSTEM',   // Aggregate issue
      summary: `${total} orphaned records from ${ids.length} inactive persons`,
      detail: {
        inactivePersonCount: ids.length,
        orphanedPublications: orphanPubs,
        orphanedResearchUpdates: orphanResearch,
        orphanedCompetitionUpdates: orphanComp,
        orphanedEvaluationUpdates: orphanEval,
        totalOrphaned: total,
      },
      suggestedAction: total > 0 ? 'AUTO_FIX' : 'REVIEW',
    });
  }

  return issues;
}

/**
 * Detect suspicious score patterns — extremely low or high scores.
 */
export async function scanSuspiciousScores(): Promise<DataIssue[]> {
  const persons = await prisma.person.findMany({
    where: {
      isActive: true,
      OR: [
        { score: { lt: 10 } },
        { score: { gt: 200 } },
      ],
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      score: true,
      hIndex: true,
      _count: { select: { reports: true } },
    },
    orderBy: { score: 'asc' },
    take: 50,
  });

  return persons.map(p => ({
    type: 'SUSPICIOUS_SCORE' as IssueType,
    severity: (p.score < 10 || p.score > 200) ? 'high' : 'medium' as IssueSeverity,
    entityType: 'PERSON' as const,
    entityId: p.id,
    summary: `${p.nameZh || p.nameEn} has score ${p.score?.toFixed(0)} (baseline=100)`,
    detail: {
      nameZh: p.nameZh,
      nameEn: p.nameEn,
      institution: p.institution,
      score: p.score,
      hIndex: p.hIndex,
      reportCount: p._count.reports,
    },
    suggestedAction: 'REVIEW',
  }));
}

/**
 * Detect persons with no primary fields assigned.
 */
export async function scanEmptyFields(): Promise<DataIssue[]> {
  // Persons with zero PersonField records
  const persons = await prisma.$queryRaw<Array<{
    id: string;
    namezh: string;
    institution: string;
    hindex: number | null;
  }>>`
    SELECT p."id", p."nameZh" as namezh, p."institution", p."hIndex" as hindex
    FROM "Person" p
    LEFT JOIN "PersonField" pf ON pf."personId" = p."id"
    WHERE p."isActive" = true
      AND pf."personId" IS NULL
    LIMIT 100
  `;

  return persons.map(p => ({
    type: 'EMPTY_FIELDS' as IssueType,
    severity: 'medium' as IssueSeverity,
    entityType: 'PERSON' as const,
    entityId: p.id,
    summary: `${p.namezh} has no research fields assigned`,
    detail: {
      nameZh: p.namezh,
      institution: p.institution,
      hIndex: p.hindex,
    },
    suggestedAction: 'NOTIFY',
  }));
}

/**
 * Detect persons deactivated long ago that still have content referencing them.
 */
export async function scanInactiveWithContent(): Promise<DataIssue[]> {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // Find persons inactive for >60 days that still have score breakdowns or fields
  const persons = await prisma.$queryRaw<Array<{
    id: string;
    namezh: string;
    updatedat: string;
  }>>`
    SELECT p."id", p."nameZh" as namezh, p."scoreUpdatedAt"::text as updatedat
    FROM "Person" p
    WHERE p."isActive" = false
      AND p."scoreUpdatedAt" < ${cutoff}::timestamp
    LIMIT 100
  `;

  if (persons.length === 0) return [];

  // Count how many still have residual data
  const ids = persons.map(p => p.id);
  const [scoreBreakdowns, personFields, ratingLogs] = await Promise.all([
    prisma.scoreBreakdown.count({ where: { personId: { in: ids } } }),
    prisma.personField.count({ where: { personId: { in: ids } } }),
    prisma.ratingLog.count({ where: { personId: { in: ids } } }),
  ]);

  const total = scoreBreakdowns + personFields + ratingLogs;

  if (total === 0) return [];

  return [{
    type: 'INACTIVE_WITH_CONTENT' as IssueType,
    severity: 'low' as IssueSeverity,
    entityType: 'PERSON' as const,
    entityId: 'SYSTEM',
    summary: `${persons.length} long-inactive persons have ${total} residual records`,
    detail: {
      personCount: persons.length,
      residualScoreBreakdowns: scoreBreakdowns,
      residualPersonFields: personFields,
      residualRatingLogs: ratingLogs,
      totalResidual: total,
    },
    suggestedAction: 'AUTO_FIX',
  }];
}

// ─── Orchestration ───

export interface ScanOptions {
  /** Specific scan types to run (defaults to all) */
  types?: IssueType[];
  /** Max issues per type (default 100) */
  limit?: number;
}

/**
 * Run all data quality scans and return a consolidated report.
 */
export async function runFullScan(opts: ScanOptions = {}): Promise<ScanResult> {
  const types = opts.types || [
    'GARBAGE_NAME',
    'JUNK_BIO',
    'INCOMPLETE_PROFILE',
    'DUPLICATE_PERSON',
    'STALE_DATA',
    'ORPHANED_RECORD',
    'SUSPICIOUS_SCORE',
    'EMPTY_FIELDS',
    'INACTIVE_WITH_CONTENT',
  ];
  const limit = opts.limit || 100;

  const scanners: Array<{ type: IssueType; fn: () => Promise<DataIssue[]> }> = [];

  if (types.includes('GARBAGE_NAME')) scanners.push({ type: 'GARBAGE_NAME', fn: scanGarbageNames });
  if (types.includes('JUNK_BIO')) scanners.push({ type: 'JUNK_BIO', fn: scanJunkBios });
  if (types.includes('INCOMPLETE_PROFILE')) scanners.push({ type: 'INCOMPLETE_PROFILE', fn: scanIncompleteProfiles });
  if (types.includes('DUPLICATE_PERSON')) scanners.push({ type: 'DUPLICATE_PERSON', fn: scanDuplicatePersons });
  if (types.includes('STALE_DATA')) scanners.push({ type: 'STALE_DATA', fn: scanStaleData });
  if (types.includes('ORPHANED_RECORD')) scanners.push({ type: 'ORPHANED_RECORD', fn: scanOrphanedRecords });
  if (types.includes('SUSPICIOUS_SCORE')) scanners.push({ type: 'SUSPICIOUS_SCORE', fn: scanSuspiciousScores });
  if (types.includes('EMPTY_FIELDS')) scanners.push({ type: 'EMPTY_FIELDS', fn: scanEmptyFields });
  if (types.includes('INACTIVE_WITH_CONTENT')) scanners.push({ type: 'INACTIVE_WITH_CONTENT', fn: scanInactiveWithContent });

  // Run all scans in parallel
  const results = await Promise.all(
    scanners.map(async ({ type, fn }) => {
      try {
        const issues = await fn();
        return { type, issues: issues.slice(0, limit) };
      } catch (error) {
        console.error(`[DataQuality] Scanner "${type}" failed:`, error);
        return { type, issues: [] };
      }
    })
  );

  // Aggregate
  const allIssues = results.flatMap(r => r.issues);
  const byType = {} as Record<IssueType, number>;
  const bySeverity: Record<IssueSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const r of results) {
    byType[r.type] = r.issues.length;
  }
  for (const issue of allIssues) {
    bySeverity[issue.severity]++;
  }

  const totalPersons = await prisma.person.count({ where: { isActive: true } });

  return {
    scannedAt: new Date().toISOString(),
    totalPersons,
    totalIssues: allIssues.length,
    byType,
    bySeverity,
    issues: allIssues,
    autoFixable: allIssues.filter(i => i.suggestedAction === 'AUTO_FIX').length,
    needsReview: allIssues.filter(i => i.suggestedAction === 'REVIEW').length,
  };
}

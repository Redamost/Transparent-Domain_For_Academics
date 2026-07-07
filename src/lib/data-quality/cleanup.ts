// ─── Data Quality Cleanup ───
// Autonomous cleanup actions that can safely fix detected issues.
// All destructive operations are gated behind safety checks and
// produce detailed AuditLog entries.

import { prisma } from '@/lib/prisma';
import type { DataIssue, IssueType } from './scanner';

// ─── Types ───

export interface CleanupAction {
  issueType: IssueType;
  action: 'DEACTIVATE_PERSON' | 'DELETE_RECORDS' | 'CLEAR_FIELD' | 'MERGE_DUPLICATES' | 'PURGE_PERSON';
  entityType: string;
  entityId: string;
  description: string;
  success: boolean;
  error?: string;
}

export interface CleanupResult {
  executedAt: string;
  dryRun: boolean;
  totalActions: number;
  succeeded: number;
  failed: number;
  actions: CleanupAction[];
  summary: string;
}

// ─── Helper ───

async function createAuditEntry(
  action: string,
  entityType: string,
  entityId: string,
  detail: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      newData: detail as any,
    },
  });
}

// ─── Cleanup Functions ───

/**
 * Auto-deactivate persons with garbage names that have NO academic data
 * (no hIndex, no publications, no external IDs).
 */
async function deactivateGarbagePersons(dryRun: boolean): Promise<CleanupAction[]> {
  // Find garbage-name persons
  const persons = await prisma.$queryRaw<Array<{
    id: string;
    namezh: string;
    nameen: string | null;
    institution: string | null;
    hindex: number | null;
    pubcount: bigint;
  }>>`
    SELECT
      p."id",
      p."nameZh" as namezh,
      p."nameEn" as nameen,
      p."institution",
      p."hIndex" as hindex,
      (SELECT COUNT(*) FROM "Publication" WHERE "personId" = p."id") as pubcount
    FROM "Person" p
    WHERE p."isActive" = true
      AND p."metadata"->>'source' != 'seed'
      AND (
        -- Very short names
        char_length(COALESCE(p."nameZh", '')) <= 1
        -- Names matching junk patterns
        OR p."nameZh" IN ('首页', '登录', '注册', '返回', '导航', '菜单', '测试', '无', '暂无', '匿名')
        OR p."nameZh" ~ '^[0-9]+$'
        OR p."nameZh" ~ '^[!@#$%^&*()_+=\[\]{};"''\\|,.<>/?]+$'
        -- HTML in names
        OR p."nameZh" ~ '<[^>]+>.*</[^>]+>'
      )
      AND (p."hIndex" IS NULL OR p."hIndex" = 0)
      AND NOT EXISTS (SELECT 1 FROM "Publication" WHERE "personId" = p."id" HAVING COUNT(*) > 0)
    LIMIT 50
  `;

  const actions: CleanupAction[] = [];

  for (const p of persons) {
    const desc = `Deactivate garbage person "${p.namezh}" (${p.institution || 'no institution'}), hIndex=${p.hindex ?? 'null'}, pubs=${p.pubcount}`;

    if (!dryRun) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.person.update({
            where: { id: p.id },
            data: {
              isActive: false,
              metadata: {
                cleanedUpAt: new Date().toISOString(),
                cleanupReason: 'GARBAGE_NAME_AUTO',
              },
            } as any,
          });

          // Hard-delete any associated sub-records
          await tx.publication.deleteMany({ where: { personId: p.id } });
          await tx.researchUpdate.deleteMany({ where: { personId: p.id } });
          await tx.competitionUpdate.deleteMany({ where: { personId: p.id } });
          await tx.evaluationUpdate.deleteMany({ where: { personId: p.id } });
        });

        await createAuditEntry('AUTO_CLEANUP_GARBAGE', 'PERSON', p.id, {
          nameZh: p.namezh,
          nameEn: p.nameen,
          institution: p.institution,
          reason: 'GARBAGE_NAME_AUTO',
        });

        actions.push({ issueType: 'GARBAGE_NAME', action: 'DEACTIVATE_PERSON', entityType: 'PERSON', entityId: p.id, description: desc, success: true });
      } catch (error) {
        actions.push({ issueType: 'GARBAGE_NAME', action: 'DEACTIVATE_PERSON', entityType: 'PERSON', entityId: p.id, description: desc, success: false, error: String(error) });
      }
    } else {
      actions.push({ issueType: 'GARBAGE_NAME', action: 'DEACTIVATE_PERSON', entityType: 'PERSON', entityId: p.id, description: `[DRY RUN] ${desc}`, success: true });
    }
  }

  return actions;
}

/**
 * Clean orphaned records — publications/updates belonging to inactive persons.
 */
async function cleanOrphanedRecords(dryRun: boolean): Promise<CleanupAction[]> {
  const actions: CleanupAction[] = [];

  // Find inactive person IDs
  const inactiveIds = (await prisma.person.findMany({
    where: { isActive: false },
    select: { id: true },
  })).map(p => p.id);

  if (inactiveIds.length === 0) return actions;

  const tables = [
    { name: 'Publication', model: prisma.publication },
    { name: 'ResearchUpdate', model: prisma.researchUpdate },
    { name: 'CompetitionUpdate', model: prisma.competitionUpdate },
    { name: 'EvaluationUpdate', model: prisma.evaluationUpdate },
  ] as const;

  for (const table of tables) {
    const count = await (table.model as any).count({ where: { personId: { in: inactiveIds } } });

    if (count === 0) continue;

    const desc = `Delete ${count} orphaned ${table.name} records from ${inactiveIds.length} inactive persons`;

    if (!dryRun) {
      try {
        const result = await (table.model as any).deleteMany({
          where: { personId: { in: inactiveIds } },
        });

        await createAuditEntry('AUTO_CLEANUP_ORPHANS', table.name.toUpperCase(), 'BATCH', {
          table: table.name,
          deletedCount: result.count,
          inactivePersonCount: inactiveIds.length,
        });

        actions.push({
          issueType: 'ORPHANED_RECORD',
          action: 'DELETE_RECORDS',
          entityType: table.name.toUpperCase().replace(/\s/g, '_'),
          entityId: 'BATCH',
          description: desc,
          success: true,
        });
      } catch (error) {
        actions.push({
          issueType: 'ORPHANED_RECORD',
          action: 'DELETE_RECORDS',
          entityType: table.name.toUpperCase().replace(/\s/g, '_'),
          entityId: 'BATCH',
          description: desc,
          success: false,
          error: String(error),
        });
      }
    } else {
      actions.push({
        issueType: 'ORPHANED_RECORD',
        action: 'DELETE_RECORDS',
        entityType: table.name.toUpperCase().replace(/\s/g, '_'),
        entityId: 'BATCH',
        description: `[DRY RUN] Would ${desc}`,
        success: true,
      });
    }
  }

  return actions;
}

/**
 * Clear junk bios for persons with very low info density bios (<20% meaningful content).
 * Sets bioZh to null rather than deactivating the person.
 */
async function clearJunkBios(dryRun: boolean): Promise<CleanupAction[]> {
  const persons = await prisma.person.findMany({
    where: {
      isActive: true,
      bioZh: { not: null },
    },
    select: { id: true, nameZh: true, bioZh: true },
    take: 200,
  });

  const actions: CleanupAction[] = [];

  for (const p of persons) {
    const bio = p.bioZh || '';
    if (bio.length < 10) continue;

    // Check for HTML fragments
    const hasHtml = /<div|<span|<p|<a\s|<li|<ul|<table|&[a-z]+;/.test(bio);
    const meaningful = (bio.match(/[一-鿿㐀-䶿a-zA-Z0-9]/g) || []).length;
    const density = meaningful / bio.length;

    const shouldClear = hasHtml || density < 0.2;

    if (shouldClear) {
      const desc = `Clear junk bio for ${p.nameZh} (density=${(density * 100).toFixed(0)}%, hasHtml=${hasHtml})`;

      if (!dryRun) {
        try {
          await prisma.person.update({
            where: { id: p.id },
            data: { bioZh: null },
          });

          await createAuditEntry('AUTO_CLEANUP_JUNK_BIO', 'PERSON', p.id, {
            nameZh: p.nameZh,
            reason: hasHtml ? 'HTML_IN_BIO' : 'LOW_DENSITY',
            infoDensity: density,
          });

          actions.push({ issueType: 'JUNK_BIO', action: 'CLEAR_FIELD', entityType: 'PERSON', entityId: p.id, description: desc, success: true });
        } catch (error) {
          actions.push({ issueType: 'JUNK_BIO', action: 'CLEAR_FIELD', entityType: 'PERSON', entityId: p.id, description: desc, success: false, error: String(error) });
        }
      } else {
        actions.push({ issueType: 'JUNK_BIO', action: 'CLEAR_FIELD', entityType: 'PERSON', entityId: p.id, description: `[DRY RUN] ${desc}`, success: true });
      }
    }
  }

  return actions;
}

/**
 * Purge residual data for long-inactive persons (score breakdowns, field assignments, rating logs).
 */
async function purgeResidualData(dryRun: boolean): Promise<CleanupAction[]> {
  const actions: CleanupAction[] = [];
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const longInactiveIds = (await prisma.person.findMany({
    where: {
      isActive: false,
      scoreUpdatedAt: { lt: cutoff },
    },
    select: { id: true },
  })).map(p => p.id);

  if (longInactiveIds.length === 0) return actions;

  const tables = [
    { name: 'ScoreBreakdown', model: prisma.scoreBreakdown },
    { name: 'PersonField', model: prisma.personField },
    { name: 'RatingLog', model: prisma.ratingLog },
    { name: 'Report', model: prisma.report },
  ] as const;

  for (const table of tables) {
    const count = await (table.model as any).count({ where: { personId: { in: longInactiveIds } } });

    if (count === 0) continue;

    const desc = `Purge ${count} residual ${table.name} records for ${longInactiveIds.length} long-inactive persons`;

    if (!dryRun) {
      try {
        const result = await (table.model as any).deleteMany({
          where: { personId: { in: longInactiveIds } },
        });

        await createAuditEntry('AUTO_PURGE_RESIDUAL', table.name.toUpperCase(), 'BATCH', {
          table: table.name,
          deletedCount: result.count,
          personCount: longInactiveIds.length,
        });

        actions.push({
          issueType: 'INACTIVE_WITH_CONTENT',
          action: 'DELETE_RECORDS',
          entityType: table.name.toUpperCase(),
          entityId: 'BATCH',
          description: desc,
          success: true,
        });
      } catch (error) {
        actions.push({
          issueType: 'INACTIVE_WITH_CONTENT',
          action: 'DELETE_RECORDS',
          entityType: table.name.toUpperCase(),
          entityId: 'BATCH',
          description: desc,
          success: false,
          error: String(error),
        });
      }
    } else {
      actions.push({
        issueType: 'INACTIVE_WITH_CONTENT',
        action: 'DELETE_RECORDS',
        entityType: table.name.toUpperCase(),
        entityId: 'BATCH',
        description: `[DRY RUN] Would ${desc}`,
        success: true,
      });
    }
  }

  return actions;
}

/**
 * Deactivate persons with junk bios AND garbage names AND no academic data.
 * This is the most aggressive auto-fix — triple-check before acting.
 */
async function deactivateDefiniteJunk(dryRun: boolean): Promise<CleanupAction[]> {
  // Find persons matching ALL junk criteria
  const persons = await prisma.$queryRaw<Array<{
    id: string;
    namezh: string;
    nameen: string | null;
    institution: string | null;
    hindex: number | null;
    pubcount: bigint;
  }>>`
    SELECT
      p."id",
      p."nameZh" as namezh,
      p."nameEn" as nameen,
      p."institution",
      p."hIndex" as hindex,
      (SELECT COUNT(*) FROM "Publication" WHERE "personId" = p."id") as pubcount
    FROM "Person" p
    WHERE p."isActive" = true
      AND p."metadata"->>'source' != 'seed'
      AND p."hIndex" IS NULL
      AND p."nameEn" IS NULL
      AND p."department" IS NULL
      AND p."email" IS NULL
      AND (p."bioZh" IS NULL OR char_length(p."bioZh") < 20)
      AND (
        char_length(COALESCE(p."nameZh", '')) <= 1
        OR char_length(COALESCE(p."nameZh", '')) > 60
        OR p."nameZh" ~ '<[^>]+>'
      )
      AND NOT EXISTS (SELECT 1 FROM "Publication" WHERE "personId" = p."id")
    LIMIT 50
  `;

  const actions: CleanupAction[] = [];

  for (const p of persons) {
    const desc = `Definite junk: "${p.namezh}" — no nameEn, no department, no email, no hIndex, no pubs`;

    if (!dryRun) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.person.update({
            where: { id: p.id },
            data: {
              isActive: false,
              metadata: {
                cleanedUpAt: new Date().toISOString(),
                cleanupReason: 'DEFINITE_JUNK_AUTO',
              },
            } as any,
          });
        });

        await createAuditEntry('AUTO_CLEANUP_DEFINITE_JUNK', 'PERSON', p.id, {
          nameZh: p.namezh,
          institution: p.institution,
          reason: 'ALL_JUNK_CRITERIA_MET',
        });

        actions.push({ issueType: 'GARBAGE_NAME', action: 'DEACTIVATE_PERSON', entityType: 'PERSON', entityId: p.id, description: desc, success: true });
      } catch (error) {
        actions.push({ issueType: 'GARBAGE_NAME', action: 'DEACTIVATE_PERSON', entityType: 'PERSON', entityId: p.id, description: desc, success: false, error: String(error) });
      }
    } else {
      actions.push({ issueType: 'GARBAGE_NAME', action: 'DEACTIVATE_PERSON', entityType: 'PERSON', entityId: p.id, description: `[DRY RUN] ${desc}`, success: true });
    }
  }

  return actions;
}

// ─── Orchestration ───

export interface CleanupOptions {
  dryRun?: boolean;
  /** Which cleanup types to run. Defaults to all safe operations. */
  types?: Array<'garbage' | 'orphans' | 'junk-bios' | 'residual' | 'definite-junk'>;
}

/**
 * Run all autonomous cleanup operations.
 * By default runs in DRY RUN mode — pass dryRun: false to execute.
 */
export async function runAutonomousCleanup(opts: CleanupOptions = {}): Promise<CleanupResult> {
  const dryRun = opts.dryRun !== false; // Default to dry run for safety
  const types = opts.types || ['garbage', 'orphans', 'junk-bios', 'residual', 'definite-junk'];

  const allActions: CleanupAction[] = [];

  // Run cleanup operations sequentially (order matters — deactivate before cleaning orphans)
  const operations: Array<{ type: string; fn: (dry: boolean) => Promise<CleanupAction[]> }> = [];

  if (types.includes('definite-junk')) operations.push({ type: 'definite-junk', fn: deactivateDefiniteJunk });
  if (types.includes('garbage')) operations.push({ type: 'garbage', fn: deactivateGarbagePersons });
  if (types.includes('junk-bios')) operations.push({ type: 'junk-bios', fn: clearJunkBios });
  if (types.includes('orphans')) operations.push({ type: 'orphans', fn: cleanOrphanedRecords });
  if (types.includes('residual')) operations.push({ type: 'residual', fn: purgeResidualData });

  for (const op of operations) {
    try {
      const actions = await op.fn(dryRun);
      allActions.push(...actions);
    } catch (error) {
      console.error(`[DataCleanup] Operation "${op.type}" failed:`, error);
    }
  }

  const succeeded = allActions.filter(a => a.success).length;
  const failed = allActions.filter(a => !a.success).length;

  // Log summary to audit
  if (!dryRun && allActions.length > 0) {
    await createAuditEntry('AUTO_CLEANUP_SUMMARY', 'SYSTEM', 'BATCH', {
      totalActions: allActions.length,
      succeeded,
      failed,
      types: types,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    executedAt: new Date().toISOString(),
    dryRun,
    totalActions: allActions.length,
    succeeded,
    failed,
    actions: allActions,
    summary: dryRun
      ? `DRY RUN: Would execute ${allActions.length} actions (${succeeded} valid, ${failed} skipped)`
      : `Executed ${allActions.length} actions: ${succeeded} succeeded, ${failed} failed`,
  };
}

/**
 * Convenience: run scan + cleanup in one flow.
 * Returns both scan results and cleanup results.
 */
export async function scheduledDataMaintenance(): Promise<{
  scan: Awaited<ReturnType<typeof import('./scanner').runFullScan>>;
  cleanup: CleanupResult;
}> {
  const { runFullScan } = await import('./scanner');

  console.log('[DataMaintenance] Starting scheduled data quality scan...');
  const scan = await runFullScan();

  console.log(`[DataMaintenance] Scan complete: ${scan.totalIssues} issues found (${scan.autoFixable} auto-fixable)`);

  // Only run cleanup if there are auto-fixable issues
  let cleanup: CleanupResult;
  if (scan.autoFixable > 0) {
    console.log('[DataMaintenance] Running autonomous cleanup...');
    cleanup = await runAutonomousCleanup({ dryRun: false });
    console.log(`[DataMaintenance] Cleanup complete: ${cleanup.succeeded}/${cleanup.totalActions} actions succeeded`);
  } else {
    cleanup = {
      executedAt: new Date().toISOString(),
      dryRun: true,
      totalActions: 0,
      succeeded: 0,
      failed: 0,
      actions: [],
      summary: 'No auto-fixable issues found — skipping cleanup',
    };
  }

  return { scan, cleanup };
}

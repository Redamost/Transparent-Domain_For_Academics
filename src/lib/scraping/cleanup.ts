// ─── Database Cleanup ───
// Removes seed/fake data and orphaned records.
// Seed data is identified by metadata->>'source' = 'seed'.

import { prisma } from '@/lib/prisma';

export interface CleanupStats {
  seedPersons: number;
  seedPublications: number;
  seedResearchUpdates: number;
  seedCompetitionUpdates: number;
  seedEvaluationUpdates: number;
  deactivated: number;
  deleted: number;
}

/**
 * Count all seed-flagged records without modifying anything.
 */
export async function countSeedData(): Promise<CleanupStats> {
  const seedPersons = await prisma.person.count({
    where: {
      isActive: true,
      metadata: { path: ['source'], equals: 'seed' },
    },
  });

  const seedPublications = await prisma.publication.count({
    where: { source: 'seed' },
  });

  const seedResearchUpdates = await prisma.researchUpdate.count({
    where: { source: 'seed' },
  });

  const seedCompetitionUpdates = await prisma.competitionUpdate.count({
    where: { source: 'seed' },
  });

  const seedEvaluationUpdates = await prisma.evaluationUpdate.count({
    where: { source: 'seed' },
  });

  return {
    seedPersons,
    seedPublications,
    seedResearchUpdates,
    seedCompetitionUpdates,
    seedEvaluationUpdates,
    deactivated: 0,
    deleted: 0,
  };
}

/**
 * Soft-deactivate all seed-flagged persons and hard-delete their related records.
 * Uses isActive = false for persons (safe), and hard-deletes sub-records.
 *
 * Returns counts of affected records.
 */
export async function cleanupSeedData(): Promise<CleanupStats> {
  // 1. Find all seed persons
  const seedPersonIds = await prisma.person.findMany({
    where: {
      isActive: true,
      metadata: { path: ['source'], equals: 'seed' },
    },
    select: { id: true },
  });

  const ids = seedPersonIds.map((p) => p.id);
  const seedPersons = ids.length;

  if (ids.length === 0) {
    return {
      seedPersons: 0,
      seedPublications: 0,
      seedResearchUpdates: 0,
      seedCompetitionUpdates: 0,
      seedEvaluationUpdates: 0,
      deactivated: 0,
      deleted: 0,
    };
  }

  // 2. Count related records before deletion
  const [
    seedPublications,
    seedResearchUpdates,
    seedCompetitionUpdates,
    seedEvaluationUpdates,
  ] = await Promise.all([
    prisma.publication.count({ where: { source: 'seed' } }),
    prisma.researchUpdate.count({ where: { source: 'seed' } }),
    prisma.competitionUpdate.count({ where: { source: 'seed' } }),
    prisma.evaluationUpdate.count({ where: { source: 'seed' } }),
  ]);

  // 3. Transaction: soft-deactivate persons + hard-delete sub-records
  await prisma.$transaction(async (tx) => {
    // Soft-deactivate all seed persons
    await tx.person.updateMany({
      where: { id: { in: ids } },
      data: {
        isActive: false,
        metadata: {
          source: 'seed',
          cleanedUpAt: new Date().toISOString(),
          originalActive: true,
        },
      },
    });

    // Hard-delete seed publications (not linked to personId, source-based)
    await tx.publication.deleteMany({ where: { source: 'seed' } });

    // Hard-delete seed research updates
    await tx.researchUpdate.deleteMany({ where: { source: 'seed' } });

    // Hard-delete seed competition updates
    await tx.competitionUpdate.deleteMany({ where: { source: 'seed' } });

    // Hard-delete seed evaluation updates
    await tx.evaluationUpdate.deleteMany({ where: { source: 'seed' } });
  });

  // 4. Log to audit trail
  await prisma.auditLog.create({
    data: {
      action: 'CLEANUP_SEED_DATA',
      entityType: 'SYSTEM',
      newData: {
        deactivatedPersons: seedPersons,
        deletedPublications: seedPublications,
        deletedResearchUpdates: seedResearchUpdates,
        deletedCompetitions: seedCompetitionUpdates,
        deletedEvaluations: seedEvaluationUpdates,
      },
    },
  });

  console.log(
    `[Cleanup] Removed seed data: ${seedPersons} persons, ${seedPublications} pubs, ` +
    `${seedResearchUpdates} research, ${seedCompetitionUpdates} comp, ${seedEvaluationUpdates} eval`,
  );

  return {
    seedPersons,
    seedPublications,
    seedResearchUpdates,
    seedCompetitionUpdates,
    seedEvaluationUpdates,
    deactivated: seedPersons,
    deleted: seedPublications + seedResearchUpdates + seedCompetitionUpdates + seedEvaluationUpdates,
  };
}

/**
 * Hard-delete all soft-deactivated persons and their related records.
 * Use with caution — this is irreversible.
 */
export async function purgeDeactivatedPersons(): Promise<number> {
  const deactivatedIds = await prisma.person.findMany({
    where: { isActive: false },
    select: { id: true },
  });

  const ids = deactivatedIds.map((p) => p.id);

  if (ids.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    // Cascade deletes for related tables
    await tx.publication.deleteMany({ where: { personId: { in: ids } } });
    await tx.researchUpdate.deleteMany({ where: { personId: { in: ids } } });
    await tx.competitionUpdate.deleteMany({ where: { personId: { in: ids } } });
    await tx.evaluationUpdate.deleteMany({ where: { personId: { in: ids } } });
    await tx.personField.deleteMany({ where: { personId: { in: ids } } });
    await tx.scoreBreakdown.deleteMany({ where: { personId: { in: ids } } });
    await tx.ratingLog.deleteMany({ where: { personId: { in: ids } } });
    await tx.person.deleteMany({ where: { id: { in: ids } } });
  });

  await prisma.auditLog.create({
    data: {
      action: 'PURGE_DEACTIVATED',
      entityType: 'SYSTEM',
      newData: { purgedPersons: ids.length },
    },
  });

  console.log(`[Cleanup] Purged ${ids.length} deactivated persons`);
  return ids.length;
}

// ─── Person Merger ───
// Merges one person record (source) into another (target).
// Reassigns publications, research updates, and field associations.
// Soft-deletes the source person.
//
// Usage: npx tsx scripts/merge-duplicates.ts <targetId> <sourceId>

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: npx tsx scripts/merge-duplicates.ts <targetId> <sourceId>');
    process.exit(1);
  }

  const [targetId, sourceId] = args;

  if (targetId === sourceId) {
    console.error('Error: targetId and sourceId must be different');
    process.exit(1);
  }

  // Verify both persons exist
  const [target, source] = await Promise.all([
    prisma.person.findUnique({ where: { id: targetId } }),
    prisma.person.findUnique({ where: { id: sourceId } }),
  ]);

  if (!target) {
    console.error(`Error: Target person ${targetId} not found`);
    process.exit(1);
  }
  if (!source) {
    console.error(`Error: Source person ${sourceId} not found`);
    process.exit(1);
  }

  console.log('=== Person Merger ===');
  console.log(`Target: ${target.nameZh} (${target.nameEn || 'N/A'}) | ${target.institution || 'N/A'}`);
  console.log(`Source: ${source.nameZh} (${source.nameEn || 'N/A'}) | ${source.institution || 'N/A'}`);
  console.log();

  await prisma.$transaction(async (tx) => {
    // 1. Reassign publications (skip DOIs already on target)
    const targetPubDOIs = new Set(
      (await tx.publication.findMany({
        where: { personId: targetId },
        select: { doi: true },
      }))
        .filter((p) => p.doi)
        .map((p) => p.doi!)
    );

    const sourcePubs = await tx.publication.findMany({
      where: { personId: sourceId },
    });

    let pubMoved = 0;
    let pubSkipped = 0;
    for (const pub of sourcePubs) {
      if (pub.doi && targetPubDOIs.has(pub.doi)) {
        pubSkipped++;
        continue; // Already exists on target
      }
      await tx.publication.update({
        where: { id: pub.id },
        data: { personId: targetId },
      });
      if (pub.doi) targetPubDOIs.add(pub.doi);
      pubMoved++;
    }
    console.log(`  Publications: ${pubMoved} moved, ${pubSkipped} skipped (already on target)`);

    // 2. Reassign research updates
    const sourceUpdates = await tx.researchUpdate.findMany({
      where: { personId: sourceId },
    });
    for (const update of sourceUpdates) {
      await tx.researchUpdate.update({
        where: { id: update.id },
        data: { personId: targetId },
      });
    }
    console.log(`  Research updates: ${sourceUpdates.length} moved`);

    // 3. Reassign field associations (only if not already on target)
    const targetFieldIds = new Set(
      (await tx.personField.findMany({
        where: { personId: targetId },
        select: { fieldId: true },
      })).map((pf) => pf.fieldId)
    );

    const sourceFields = await tx.personField.findMany({
      where: { personId: sourceId },
    });

    let fieldMoved = 0;
    for (const pf of sourceFields) {
      if (targetFieldIds.has(pf.fieldId)) {
        continue; // Already linked
      }
      await tx.personField.update({
        where: { personId_fieldId: { personId: sourceId, fieldId: pf.fieldId } },
        data: { personId: targetId },
      });
      targetFieldIds.add(pf.fieldId);
      fieldMoved++;
    }
    console.log(`  Fields: ${fieldMoved} moved, ${sourceFields.length - fieldMoved} skipped`);

    // 4. Reassign rating logs
    const sourceLogs = await tx.ratingLog.findMany({
      where: { personId: sourceId },
    });
    for (const log of sourceLogs) {
      await tx.ratingLog.update({
        where: { id: log.id },
        data: { personId: targetId },
      });
    }
    console.log(`  Rating logs: ${sourceLogs.length} moved`);

    // 5. Merge non-null external IDs into target (target null → fill from source)
    // IMPORTANT: Clear unique external IDs from source FIRST to avoid P2002 conflicts
    const updates: Record<string, unknown> = {};
    const sourceClearData: Record<string, null> = {};

    if (!target.orcidId && source.orcidId) {
      updates.orcidId = source.orcidId;
      sourceClearData.orcidId = null;
    }
    if (!target.googleScholarId && source.googleScholarId) {
      updates.googleScholarId = source.googleScholarId;
      sourceClearData.googleScholarId = null;
    }
    if (!target.researchGateId && source.researchGateId) {
      updates.researchGateId = source.researchGateId;
      sourceClearData.researchGateId = null;
    }
    if (!target.email && source.email) updates.email = source.email;
    if (!target.website && source.website) updates.website = source.website;
    if (!target.bioEn && source.bioEn) updates.bioEn = source.bioEn;
    if (!target.bioZh && source.bioZh) updates.bioZh = source.bioZh;
    if (!target.avatarUrl && source.avatarUrl) updates.avatarUrl = source.avatarUrl;
    if (target.hIndex == null && source.hIndex != null) updates.hIndex = source.hIndex;
    if (target.citationCount == null && source.citationCount != null) updates.citationCount = source.citationCount;
    if (target.publicationCount == null && source.publicationCount != null) updates.publicationCount = source.publicationCount;

    // Clear unique external IDs from source before updating target
    // This prevents P2002 unique constraint violations
    if (Object.keys(sourceClearData).length > 0) {
      await tx.person.update({
        where: { id: sourceId },
        data: sourceClearData,
      });
    }

    // Merge alternative names
    const targetAltNames: string[] = target.alternativeNames
      ? (typeof target.alternativeNames === 'string'
          ? JSON.parse(target.alternativeNames)
          : (target.alternativeNames as any))
      : [];
    const sourceAltNames: string[] = source.alternativeNames
      ? (typeof source.alternativeNames === 'string'
          ? JSON.parse(source.alternativeNames)
          : (source.alternativeNames as any))
      : [];
    const mergedAltNames = [...new Set([...targetAltNames, ...sourceAltNames])];
    if (mergedAltNames.length > 0) {
      updates.alternativeNames = JSON.stringify(mergedAltNames);
    }

    // Merge metadata
    const targetMeta = (target.metadata as Record<string, unknown>) || {};
    const sourceMeta = (source.metadata as Record<string, unknown>) || {};
    updates.metadata = { ...sourceMeta, ...targetMeta, merged: true, mergedFrom: sourceId, mergedAt: new Date().toISOString() };

    if (Object.keys(updates).length > 0) {
      await tx.person.update({
        where: { id: targetId },
        data: updates as any,
      });
      console.log(`  Merged fields: ${Object.keys(updates).join(', ')}`);
    }

    // 6. Soft-delete source person
    await tx.person.update({
      where: { id: sourceId },
      data: { isActive: false },
    });
    console.log(`  Source person deactivated`);

    // 7. Create audit log
    await tx.auditLog.create({
      data: {
        action: 'MERGE_PERSON',
        entityType: 'PERSON',
        entityId: targetId,
        newData: {
          targetId,
          sourceId,
          targetName: target.nameZh,
          sourceName: source.nameZh,
          mergedAt: new Date().toISOString(),
          stats: { pubMoved, pubSkipped, fieldMoved, updatesApplied: Object.keys(updates) },
        },
      },
    });
  });

  console.log('\n✅ Merge complete.');
  console.log(`   Target (${targetId}) now contains data from source (${sourceId}).`);
  console.log(`   Source has been deactivated.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });

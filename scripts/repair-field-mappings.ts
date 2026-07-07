// ─── Repair Field Mappings ───
// Re-runs field inference for all scholars using the latest field-inference
// rules, compares against existing field assignments, and updates records
// where the inferred fields have changed.
//
// Usage:
//   npx tsx scripts/repair-field-mappings.ts              # Full run
//   npx tsx scripts/repair-field-mappings.ts --dry-run     # Preview only
//   npx tsx scripts/repair-field-mappings.ts --limit=50    # Cap scholars
//   npx tsx scripts/repair-field-mappings.ts --dry-run --limit=50
//
// A CSV report is written to scripts/repair-field-report.csv on completion.

import { prisma } from '../src/lib/prisma';
import { inferFields } from '../src/lib/scraping/field-inference';

// ─── Configuration ───

interface RepairOptions {
  dryRun: boolean;
  limit: number;
}

function parseArgs(): RepairOptions {
  const args = process.argv.slice(2);
  const options: RepairOptions = { dryRun: false, limit: 0 };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10);
  }

  return options;
}

// ─── Types ───

interface ScholarData {
  id: string;
  nameZh: string;
  department: string | null;
  bio: string | null;
  institution: string | null;
  sourceUrl: string | null;
  existingFieldSlugs: string[];
  researchText: string;
  publicationTitles: string[];
}

interface RepairResult {
  scholarId: string;
  nameZh: string;
  existingSlugs: string[];
  newSlugs: string[];
  added: string[];
  removed: string[];
  unchanged: string[];
  status: 'changed' | 'unchanged' | 'no_fields_inferred' | 'error';
  error?: string;
}

// ─── Query ───

async function findScholars(limit: number): Promise<ScholarData[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persons = await (prisma as any).person.findMany({
    where: { isActive: true },
    select: {
      id: true,
      nameZh: true,
      department: true,
      bioZh: true,
      institution: true,
      website: true,
      metadata: true,
      fields: {
        select: { field: { select: { slug: true } } },
      },
      researchUpdates: {
        select: { title: true, description: true },
        take: 30,
      },
      publications: {
        select: { title: true },
        take: 20,
        where: { title: { not: null } },
      },
    },
    take: limit > 0 ? limit : undefined,
    orderBy: { lastScrapedAt: 'desc' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return persons.map((p: any) => {
    const meta = (p.metadata || {}) as Record<string, unknown>;
    const rawMeta = (meta.rawMetadata || {}) as Record<string, unknown>;
    const sourceUrl = (p.website || rawMeta.sourceUrl || meta.sourceUrl) as string | undefined;

    const researchText = (p.researchUpdates || [])
      .map((u: { title: string; description: string | null }) =>
        [u.title, u.description].filter(Boolean).join(': '))
      .join('; ');

    const publicationTitles = (p.publications || [])
      .map((pub: { title: string }) => pub.title);

    return {
      id: p.id,
      nameZh: p.nameZh,
      department: p.department,
      bio: p.bioZh,
      institution: p.institution,
      sourceUrl: sourceUrl || null,
      existingFieldSlugs: (p.fields || []).map((f: { field: { slug: string } }) => f.field.slug),
      researchText,
      publicationTitles,
    };
  });
}

// ─── Main ───

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('═══════════════════════════════════════════');
  console.log('  Repair Field Mappings');
  console.log(`  Dry run: ${options.dryRun ? 'YES (no writes)' : 'NO (will write)'}`);
  console.log(`  Limit: ${options.limit > 0 ? options.limit : 'none'}`);
  console.log('═══════════════════════════════════════════\n');

  // 1. Find scholars
  console.log('[1/3] Loading scholars and their current data...');
  const scholars = await findScholars(options.limit);
  console.log(`  Loaded ${scholars.length} scholars\n`);

  // 2. Re-run field inference for each scholar
  console.log('[2/3] Re-running field inference...');
  const results: RepairResult[] = [];
  let changed = 0;
  let unchanged = 0;
  let noInferred = 0;
  let errors = 0;

  for (let i = 0; i < scholars.length; i++) {
    const s = scholars[i];
    const progress = `[${i + 1}/${scholars.length}]`;

    try {
      const newSlugs = inferFields({
        researchText: s.researchText || null,
        department: s.department,
        bio: s.bio,
        publications: s.publicationTitles.map((t) => ({ title: t })),
        institution: s.institution,
        sourceUrl: s.sourceUrl,
      });

      if (newSlugs.length === 0) {
        noInferred++;
        results.push({
          scholarId: s.id,
          nameZh: s.nameZh,
          existingSlugs: s.existingFieldSlugs,
          newSlugs: [],
          added: [],
          removed: s.existingFieldSlugs,
          unchanged: [],
          status: 'no_fields_inferred',
        });
        continue;
      }

      const existingSet = new Set(s.existingFieldSlugs);
      const newSet = new Set(newSlugs);

      const added = newSlugs.filter((slug) => !existingSet.has(slug));
      const removed = s.existingFieldSlugs.filter((slug) => !newSet.has(slug));
      const unchangedFields = s.existingFieldSlugs.filter((slug) => newSet.has(slug));

      if (added.length === 0 && removed.length === 0) {
        unchanged++;
        results.push({
          scholarId: s.id,
          nameZh: s.nameZh,
          existingSlugs: s.existingFieldSlugs,
          newSlugs,
          added: [],
          removed: [],
          unchanged: unchangedFields,
          status: 'unchanged',
        });
        continue;
      }

      // Fields have changed — update (unless dry run)
      changed++;
      if (!options.dryRun) {
        // Look up field IDs for the new slugs
        const allNeededSlugs = [...new Set([...s.existingFieldSlugs, ...newSlugs])];
        const fieldRecords = await prisma.field.findMany({
          where: { slug: { in: allNeededSlugs } },
          select: { id: true, slug: true },
        });
        const slugToId = new Map(fieldRecords.map((f) => [f.slug, f.id]));

        // Delete existing field assignments
        await prisma.personField.deleteMany({
          where: { personId: s.id },
        });

        // Create new field assignments
        if (newSlugs.length > 0) {
          const createData = newSlugs
            .filter((slug) => slugToId.has(slug))
            .map((slug, idx) => ({
              personId: s.id,
              fieldId: slugToId.get(slug)!,
              isPrimary: idx === 0,
            }));

          if (createData.length > 0) {
            await prisma.personField.createMany({
              data: createData,
              skipDuplicates: true,
            });
          }
        }
      }

      results.push({
        scholarId: s.id,
        nameZh: s.nameZh,
        existingSlugs: s.existingFieldSlugs,
        newSlugs,
        added,
        removed,
        unchanged: unchangedFields,
        status: 'changed',
      });

      console.log(
        `  ${progress} CHG  ${s.nameZh}: ${s.existingFieldSlugs.join(',') || '(none)'} -> ${newSlugs.join(',')}` +
        (added.length > 0 ? ` [+${added.join(',')}]` : '') +
        (removed.length > 0 ? ` [-${removed.join(',')}]` : ''),
      );
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
      results.push({ scholarId: s.id, nameZh: s.nameZh, existingSlugs: [], newSlugs: [], added: [], removed: [], unchanged: [], status: 'error', error: msg });
      console.log(`  ${progress} ERR  ${s.nameZh}: ${msg}`);
    }
  }

  // 3. Summary and CSV report
  console.log(`\n[3/3] Summary`);
  console.log(`  Changed:    ${changed}`);
  console.log(`  Unchanged:  ${unchanged}`);
  console.log(`  No fields:  ${noInferred} (no data to infer from)`);
  console.log(`  Errors:     ${errors}`);
  console.log(`  Total:      ${scholars.length}`);

  if (options.dryRun) {
    console.log('\n  *** DRY RUN - no changes were written to the database ***');
    console.log('  Run without --dry-run to apply changes.');
  }

  // Analyze what changed the most
  if (changed > 0) {
    const changedResults = results.filter((r) => r.status === 'changed');
    const addedCount = new Map<string, number>();
    const removedCount = new Map<string, number>();

    for (const r of changedResults) {
      for (const slug of r.added) addedCount.set(slug, (addedCount.get(slug) || 0) + 1);
      for (const slug of r.removed) removedCount.set(slug, (removedCount.get(slug) || 0) + 1);
    }

    console.log('\n  Top fields added:');
    for (const [slug, count] of [...addedCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    + ${slug}: ${count} scholars`);
    }

    console.log('\n  Top fields removed:');
    for (const [slug, count] of [...removedCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    - ${slug}: ${count} scholars`);
    }
  }

  // Write CSV report
  const csvHeader = 'nameZh,status,existingFields,newFields,added,removed,error';
  const csvLines = results.map((r) => [
    `"${r.nameZh}"`,
    r.status,
    `"${r.existingSlugs.join('|')}"`,
    `"${r.newSlugs.join('|')}"`,
    `"${r.added.join('|')}"`,
    `"${r.removed.join('|')}"`,
    `"${(r.error || '').replace(/"/g, '""')}"`,
  ].join(','));

  const csvContent = csvHeader + '\n' + csvLines.join('\n');
  const fs = await import('fs');
  fs.writeFileSync('scripts/repair-field-report.csv', csvContent, 'utf-8');
  console.log(`\n  Report: scripts/repair-field-report.csv`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

// ─── Backfill Bare Scholars ───
// Re-scrapes profile pages for scholars missing key fields (department, email,
// bioZh, title) and fills in missing data without overwriting existing fields.
//
// Usage:
//   npx tsx scripts/backfill-bare-scholars.ts              # Full run
//   npx tsx scripts/backfill-bare-scholars.ts --dry-run     # Preview only
//   npx tsx scripts/backfill-bare-scholars.ts --limit=20    # Cap scholars
//   npx tsx scripts/backfill-bare-scholars.ts --dry-run --limit=20
//
// A CSV report is written to scripts/backfill-report.csv on completion.

import { prisma } from '../src/lib/prisma';
import { fetchAndParseProfile } from '../src/lib/scraping/cn-university';
import { TokenBucket } from '../src/lib/scraping/rate-limiter';

// ─── Configuration ───

interface BackfillOptions {
  dryRun: boolean;
  limit: number;
  /** Only backfill scholars from these university keys (comma-separated) */
  university: string | null;
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = { dryRun: false, limit: 0, university: null };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--university=')) options.university = arg.split('=')[1];
  }

  return options;
}

// ─── Types ───

interface BareScholar {
  id: string;
  nameZh: string;
  institution: string | null;
  universityKey: string | null;
  sourceUrl: string | null;
  missingFields: string[];
  // Current values (for comparison)
  currentTitle: string | null;
  currentDepartment: string | null;
  currentEmail: string | null;
  currentBio: string | null;
}

interface BackfillResult {
  scholar: BareScholar;
  status: 'success' | 'failed' | 'no_source_url' | 'no_university_key';
  newTitle?: string;
  newDepartment?: string;
  newEmail?: string;
  newBio?: string;
  error?: string;
}

// ─── Query ───

async function findBareScholars(limit: number, universityFilter: string | null): Promise<BareScholar[]> {
  const persons = await prisma.person.findMany({
    where: {
      isActive: true,
      institution: universityFilter ? { contains: universityFilter } : { not: null },
    },
    select: {
      id: true,
      nameZh: true,
      title: true,
      department: true,
      email: true,
      bioZh: true,
      institution: true,
      website: true,
      metadata: true,
    },
    take: limit > 0 ? limit : undefined,
    orderBy: { lastScrapedAt: { sort: 'asc', nulls: 'first' } },
  });

  const bareScholars: BareScholar[] = [];

  for (const person of persons) {
    const missingFields: string[] = [];
    if (!person.title) missingFields.push('title');
    if (!person.department) missingFields.push('department');
    if (!person.email) missingFields.push('email');
    if (!person.bioZh) missingFields.push('bio');

    // Only include if missing at least 3 fields
    if (missingFields.length < 3) continue;

    const meta = (person.metadata || {}) as Record<string, unknown>;
    const rawMeta = (meta.rawMetadata || {}) as Record<string, unknown>;
    const universityKey = (rawMeta.universityKey || meta.universityKey) as string | undefined;
    const sourceUrl = (person.website || rawMeta.sourceUrl || meta.sourceUrl) as string | undefined;

    bareScholars.push({
      id: person.id,
      nameZh: person.nameZh,
      institution: person.institution,
      universityKey: universityKey || null,
      sourceUrl: sourceUrl || null,
      missingFields,
      currentTitle: person.title,
      currentDepartment: person.department,
      currentEmail: person.email,
      currentBio: person.bioZh,
    });
  }

  return bareScholars;
}

// ─── Main ───

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('═══════════════════════════════════════════');
  console.log('  Backfill Bare Scholars');
  console.log(`  Dry run: ${options.dryRun ? 'YES (no writes)' : 'NO (will write)'}`);
  console.log(`  Limit: ${options.limit > 0 ? options.limit : 'none'}`);
  if (options.university) console.log(`  University filter: ${options.university}`);
  console.log('═══════════════════════════════════════════\n');

  // 1. Find bare scholars
  console.log('[1/3] Finding bare scholars (missing >= 3 of: title, department, email, bio)...');
  const scholars = await findBareScholars(options.limit, options.university);

  if (scholars.length === 0) {
    console.log('  No bare scholars found. Database is in good shape!');
    return;
  }

  console.log(`  Found ${scholars.length} bare scholars\n`);

  // Group by university for reporting
  const byUni = new Map<string, BareScholar[]>();
  for (const s of scholars) {
    const key = s.universityKey || 'unknown';
    if (!byUni.has(key)) byUni.set(key, []);
    byUni.get(key)!.push(s);
  }
  console.log('  By university:');
  for (const [key, list] of [...byUni.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${key}: ${list.length} scholars`);
  }
  console.log();

  // 2. Re-scrape each bare scholar
  console.log('[2/3] Re-scraping profiles...');
  const backfillBucket = new TokenBucket({ capacity: 5, refillRate: 1, refillIntervalMs: 2000 });
  const results: BackfillResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < scholars.length; i++) {
    const scholar = scholars[i];
    const progress = `[${i + 1}/${scholars.length}]`;

    if (!scholar.sourceUrl || !scholar.universityKey) {
      skipped++;
      results.push({ scholar, status: scholar.sourceUrl ? 'no_university_key' : 'no_source_url' });
      console.log(`  ${progress} SKIP ${scholar.nameZh}: no source URL or university key`);
      continue;
    }

    try {
      const freshProfile = await fetchAndParseProfile(scholar.sourceUrl, scholar.universityKey);

      if (!freshProfile || !freshProfile.nameZh) {
        failed++;
        results.push({ scholar, status: 'failed', error: 'No profile returned' });
        console.log(`  ${progress} FAIL ${scholar.nameZh}: fetch returned empty`);
        continue;
      }

      // Determine what new data we got (only fill missing fields)
      const updates: Record<string, string> = {};
      if (!scholar.currentTitle && freshProfile.title) updates.title = freshProfile.title;
      if (!scholar.currentDepartment && freshProfile.department) updates.department = freshProfile.department;
      if (!scholar.currentEmail && freshProfile.email) updates.email = freshProfile.email;
      if (!scholar.currentBio && freshProfile.bio) updates.bio = freshProfile.bio;

      const filledCount = Object.keys(updates).length;

      if (filledCount === 0) {
        failed++;
        results.push({ scholar, status: 'failed', error: 'No new data extracted' });
        console.log(`  ${progress} FAIL ${scholar.nameZh}: re-scraped but no missing fields filled`);
        continue;
      }

      if (!options.dryRun) {
        const updateData: Record<string, unknown> = { lastScrapedAt: new Date() };
        if (updates.title) updateData.title = updates.title;
        if (updates.department) updateData.department = updates.department;
        if (updates.email) updateData.email = updates.email;
        if (updates.bio) updateData.bioZh = updates.bio;

        await prisma.person.update({
          where: { id: scholar.id },
          data: {
            ...updateData,
            metadata: {
              backfilledAt: new Date().toISOString(),
              backfillSourceUrl: scholar.sourceUrl,
            },
          },
        });
      }

      succeeded++;
      const filledNames = Object.keys(updates).join(', ');
      results.push({
        scholar,
        status: 'success',
        newTitle: updates.title,
        newDepartment: updates.department,
        newEmail: updates.email,
        newBio: updates.bio,
      });
      console.log(
        `  ${progress} OK   ${scholar.nameZh}: filled ${filledCount} field(s) [${filledNames}]` +
        (updates.title ? ` title="${updates.title.slice(0, 30)}"` : '') +
        (updates.department ? ` dept="${updates.department.slice(0, 20)}"` : '') +
        (updates.email ? ` email="${updates.email}"` : ''),
      );
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
      results.push({ scholar, status: 'failed', error: msg });
      console.log(`  ${progress} FAIL ${scholar.nameZh}: ${msg}`);
    }

    // Rate limit between profiles (Token Bucket: 2s between requests, burst 5)
    await backfillBucket.acquire();
  }

  // 3. Summary and CSV report
  console.log(`\n[3/3] Summary`);
  console.log(`  OK:    ${succeeded}`);
  console.log(`  FAIL:  ${failed}`);
  console.log(`  SKIP:  ${skipped} (no URL/key)`);
  console.log(`  Total: ${scholars.length}`);

  if (options.dryRun) {
    console.log('\n  *** DRY RUN - no changes were written to the database ***');
    console.log('  Run without --dry-run to apply changes.');
  }

  // Write CSV report
  const csvHeader = 'nameZh,institution,universityKey,status,missingBefore,filledFields,error';
  const csvLines = results.map((r) => {
    const missingBefore = r.scholar.missingFields.join('|');
    const filledFields: string[] = [];
    if (r.newTitle) filledFields.push('title');
    if (r.newDepartment) filledFields.push('department');
    if (r.newEmail) filledFields.push('email');
    if (r.newBio) filledFields.push('bio');

    return [
      `"${r.scholar.nameZh}"`,
      `"${r.scholar.institution || ''}"`,
      r.scholar.universityKey || '',
      r.status,
      missingBefore,
      filledFields.join('|'),
      `"${(r.error || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  const csvContent = csvHeader + '\n' + csvLines.join('\n');
  const fs = await import('fs');
  fs.writeFileSync('scripts/backfill-report.csv', csvContent, 'utf-8');
  console.log(`  Report: scripts/backfill-report.csv`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

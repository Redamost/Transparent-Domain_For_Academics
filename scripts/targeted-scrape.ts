// ─── Targeted University Scraper ───
// Directly scrapes all 39 Project 985 universities (plus CAS/Xidian).
// Supports batch processing, resume-from, and skip-existing.
//
// Usage:
//   npx tsx scripts/targeted-scrape.ts                           # Scrape ALL universities
//   npx tsx scripts/targeted-scrape.ts --batch=10                # Process 10 universities per batch
//   npx tsx scripts/targeted-scrape.ts --start-from=sjtu         # Resume from a specific university
//   npx tsx scripts/targeted-scrape.ts --max-profiles=50         # Cap profiles per university
//   npx tsx scripts/targeted-scrape.ts --skip-existing           # Skip universities with >=50 scholars
//   npx tsx scripts/targeted-scrape.ts --dry-run                 # Show what would be scraped without doing it

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';
import { mergePersonSources } from '../src/lib/scraping/normalizer';
import { deduplicatePerson } from '../src/lib/scraping/deduplicator';
import { isValidScrapedPerson } from '../src/lib/scraping/name-validator';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

// ─── All 39 Project 985 Universities ───
// Keys must match the UNIVERSITY_CONFIGS in src/lib/scraping/cn-university.ts
const ALL_985_UNIVERSITIES: { key: string; name: string }[] = [
  // ═══ C9 League (9) ═══
  { key: 'tsinghua', name: '清华大学' },
  { key: 'pku', name: '北京大学' },
  { key: 'zju', name: '浙江大学' },
  { key: 'fudan', name: '复旦大学' },
  { key: 'sjtu', name: '上海交通大学' },
  { key: 'ustc', name: '中国科学技术大学' },
  { key: 'nju', name: '南京大学' },
  { key: 'hit', name: '哈尔滨工业大学' },
  { key: 'xjtu', name: '西安交通大学' },
  // ═══ Other 985 (30) ═══
  { key: 'whu', name: '武汉大学' },
  { key: 'sysu', name: '中山大学' },
  { key: 'hust', name: '华中科技大学' },
  { key: 'tongji', name: '同济大学' },
  { key: 'beihang', name: '北京航空航天大学' },
  { key: 'sichuan', name: '四川大学' },
  { key: 'seu', name: '东南大学' },
  { key: 'ruc', name: '中国人民大学' },
  { key: 'nankai', name: '南开大学' },
  { key: 'tianjin', name: '天津大学' },
  { key: 'bit', name: '北京理工大学' },
  { key: 'dlut', name: '大连理工大学' },
  { key: 'jlu', name: '吉林大学' },
  { key: 'sdu', name: '山东大学' },
  { key: 'xmu', name: '厦门大学' },
  { key: 'lzu', name: '兰州大学' },
  { key: 'nwpu', name: '西北工业大学' },
  { key: 'scut', name: '华南理工大学' },
  { key: 'csu', name: '中南大学' },
  { key: 'hnu', name: '湖南大学' },
  { key: 'neu', name: '东北大学' },
  { key: 'cqu', name: '重庆大学' },
  { key: 'ecnu', name: '华东师范大学' },
  { key: 'bnu', name: '北京师范大学' },
  { key: 'uestc', name: '电子科技大学' },
  { key: 'cau', name: '中国农业大学' },
  { key: 'nudt', name: '国防科技大学' },
  { key: 'nwafu', name: '西北农林科技大学' },
  { key: 'muc', name: '中央民族大学' },
  { key: 'ouc', name: '中国海洋大学' },
];

// ─── CLI Args ───
const BATCH_SIZE = parseInt(
  process.argv.find((a) => a.startsWith('--batch='))?.split('=')[1] || '0',
  10,
);
const START_FROM = process.argv.find((a) => a.startsWith('--start-from='))?.split('=')[1] || '';
const MAX_PROFILES = parseInt(
  process.argv.find((a) => a.startsWith('--max-profiles='))?.split('=')[1] || '100',
  10,
);
const SKIP_EXISTING = process.argv.includes('--skip-existing');
const DRY_RUN = process.argv.includes('--dry-run');
const EXISTING_THRESHOLD = parseInt(
  process.argv.find((a) => a.startsWith('--existing-threshold='))?.split('=')[1] || '50',
  10,
);

async function getExistingCounts(): Promise<Map<string, number>> {
  const results = await prisma.person.groupBy({
    by: ['institution'],
    where: { isActive: true, institution: { not: null } },
    _count: { id: true },
  });
  const map = new Map<string, number>();
  for (const r of results) {
    if (r.institution) {
      map.set(r.institution, r._count.id);
    }
  }
  return map;
}

async function main() {
  const allArgs = process.argv.slice(2).join(' ');
  console.log(`[TargetedScrape] ===== START =====`);
  console.log(`[TargetedScrape] Args: ${allArgs || '(none)'}`);
  console.log(`[TargetedScrape] Batch size: ${BATCH_SIZE || 'ALL'}`);
  console.log(`[TargetedScrape] Max profiles per uni: ${MAX_PROFILES}`);
  console.log(`[TargetedScrape] Skip existing (>${EXISTING_THRESHOLD}): ${SKIP_EXISTING}`);
  console.log(`[TargetedScrape] Dry run: ${DRY_RUN}`);

  // Get existing scholar counts per institution
  const existingCounts = await getExistingCounts();

  // Filter and sort universities
  let universities = ALL_985_UNIVERSITIES;

  // Skip universities with sufficient existing data
  if (SKIP_EXISTING) {
    const skipped: string[] = [];
    universities = universities.filter((u) => {
      const count = existingCounts.get(u.name) || 0;
      if (count >= EXISTING_THRESHOLD) {
        skipped.push(`${u.name}(${count})`);
        return false;
      }
      return true;
    });
    if (skipped.length > 0) {
      console.log(`[TargetedScrape] Skipping ${skipped.length} universities: ${skipped.join(', ')}`);
    }
  }

  // Start from a specific university if resuming
  if (START_FROM) {
    const startIdx = universities.findIndex((u) => u.key === START_FROM);
    if (startIdx >= 0) {
      universities = universities.slice(startIdx);
      console.log(`[TargetedScrape] Resuming from: ${universities[0].name}`);
    } else {
      console.warn(`[TargetedScrape] Warning: --start-from=${START_FROM} not found in university list`);
    }
  }

  console.log(`[TargetedScrape] Will scrape ${universities.length} universities`);
  console.log(`[TargetedScrape] Universities: ${universities.map((u) => `${u.name}(${existingCounts.get(u.name) || 0})`).join(', ')}`);

  if (DRY_RUN) {
    console.log(`[TargetedScrape] DRY RUN - no scraping will be performed`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // Track stats
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const batchResults: Array<{ uni: string; scraped: number; inserted: number }> = [];

  // Process in batches if batch size is set
  for (let batchStart = 0; batchStart < universities.length; batchStart += (BATCH_SIZE || universities.length)) {
    const batch = universities.slice(batchStart, batchStart + (BATCH_SIZE || universities.length));
    const batchNum = Math.floor(batchStart / (BATCH_SIZE || universities.length)) + 1;
    const totalBatches = BATCH_SIZE ? Math.ceil(universities.length / BATCH_SIZE) : 1;

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`[TargetedScrape] BATCH ${batchNum}/${totalBatches}: ${batch.map((u) => u.name).join(', ')}`);
    console.log(`${'═'.repeat(55)}`);

    let batchInserted = 0;

    for (const uni of batch) {
      const existingCount = existingCounts.get(uni.name) || 0;
      console.log(`\n[TargetedScrape] >>> ${uni.name} (${uni.key}) [existing: ${existingCount}]`);

      try {
        const { profiles, stats } = await scrapeUniversity(uni.key, MAX_PROFILES);
        console.log(`[TargetedScrape] Scraped ${profiles.length} profiles from ${uni.name} (${stats.profilesParsed} parsed, ${stats.profilesFailed} failed, ${stats.durationMs}ms)`);

        let uniInserted = 0;
        let uniUpdated = 0;
        let uniRejected = 0;

        for (const profile of profiles) {
          try {
            // Name validation gate
            const nameCheck = isValidScrapedPerson({
              nameZh: profile.nameZh,
              nameEn: profile.nameEn,
              institution: profile.institution,
            });
            if (!nameCheck.valid) {
              if (uniRejected < 5) {
                console.warn(`  REJECTED: ${profile.nameZh} — ${nameCheck.reason}`);
              }
              uniRejected++;
              continue;
            }

            // Normalize
            const normalized = mergePersonSources([profile]);

            // Dedup
            const dedupResult = await deduplicatePerson(normalized);

            if (dedupResult.matched && dedupResult.existingPersonId) {
              // Update existing
              await prisma.person.update({
                where: { id: dedupResult.existingPersonId },
                data: {
                  institution: profile.institution || undefined,
                  email: profile.email || undefined,
                  department: profile.department || undefined,
                  website: profile.website || undefined,
                  bioZh: profile.bio || undefined,
                  lastScrapedAt: new Date(),
                },
              });
              uniUpdated++;
              totalUpdated++;
            } else {
              // Insert new
              await prisma.$transaction(async (tx) => {
                const created = await tx.person.create({
                  data: {
                    nameZh: normalized.nameZh || profile.nameZh || 'Unknown',
                    nameEn: normalized.nameEn,
                    alternativeNames: normalized.alternativeNames.length > 0
                      ? JSON.stringify(normalized.alternativeNames) : null,
                    title: normalized.title,
                    institution: normalized.institution,
                    department: normalized.department,
                    email: normalized.email,
                    website: normalized.website,
                    avatarUrl: normalized.avatarUrl,
                    bioZh: normalized.bio,
                    hIndex: null,
                    citationCount: null,
                    publicationCount: normalized.publicationCount,
                    lastScrapedAt: new Date(),
                    isVerified: false,
                    metadata: {
                      source: 'CN_UNIVERSITY',
                      confidence: 0.6,
                      scrapedAt: new Date().toISOString(),
                      ...normalized.metadata,
                    },
                  },
                });

                await initializeScoreBreakdowns(tx, created.id);

                if (normalized.publications.length > 0) {
                  await tx.publication.createMany({
                    data: normalized.publications.slice(0, 100).map((pub) => ({
                      personId: created.id,
                      title: pub.title,
                      authors: pub.authors.join('; '),
                      journal: pub.journal,
                      year: pub.year,
                      doi: pub.doi,
                      url: pub.url,
                      citationCount: pub.citationCount,
                      abstract: pub.abstract,
                      source: 'SCRAPER',
                      publishedAt: pub.publishedAt ? new Date(pub.publishedAt) : null,
                    })),
                    skipDuplicates: true,
                  });
                }

                if (normalized.researchUpdates.length > 0) {
                  await tx.researchUpdate.createMany({
                    data: normalized.researchUpdates.slice(0, 30).map((u) => ({
                      personId: created.id,
                      title: u.title,
                      description: u.description,
                      url: u.url,
                      source: u.source,
                      publishedAt: u.publishedAt ? new Date(u.publishedAt) : null,
                    })),
                  });
                }
              });
              uniInserted++;
              totalInserted++;
              batchInserted++;
            }
          } catch (err) {
            console.error(`  Error processing ${profile.nameZh}:`, err instanceof Error ? err.message : err);
            totalErrors++;
          }
        }

        if (uniRejected > 5) {
          console.warn(`  ... and ${uniRejected - 5} more rejected`);
        }
        console.log(`[TargetedScrape] ${uni.name}: +${uniInserted} new, ~${uniUpdated} updated, ${uniRejected} rejected`);

        // Audit log
        await prisma.auditLog.create({
          data: {
            action: 'TARGETED_SCRAPE',
            entityType: 'SYSTEM',
            newData: {
              university: uni.key,
              scraped: profiles.length,
              inserted: uniInserted,
              updated: uniUpdated,
              rejected: uniRejected,
            },
          },
        });

        batchResults.push({ uni: uni.name, scraped: profiles.length, inserted: uniInserted });

        // Delay between universities to avoid rate limiting
        await new Promise((r) => setTimeout(r, 3000));
      } catch (err) {
        console.error(`[TargetedScrape] Failed to scrape ${uni.name}:`, err instanceof Error ? err.message : err);
        totalErrors++;
        totalSkipped++;
      }
    }

    console.log(`\n[TargetedScrape] Batch ${batchNum} complete: +${batchInserted} new scholars`);

    // Longer delay between batches
    if (BATCH_SIZE && batchStart + BATCH_SIZE < universities.length) {
      console.log(`[TargetedScrape] Pausing 10s before next batch...`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  // ─── Final Summary ───
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`[TargetedScrape] ===== FINAL SUMMARY =====`);
  console.log(`[TargetedScrape] Total new scholars:     ${totalInserted}`);
  console.log(`[TargetedScrape] Total updated:          ${totalUpdated}`);
  console.log(`[TargetedScrape] Total errors/skipped:   ${totalErrors}`);
  console.log(`[TargetedScrape] Total processed:        ${totalInserted + totalUpdated}`);
  console.log(`\n[TargetedScrape] Per-university results:`);
  for (const r of batchResults) {
    console.log(`  ${r.uni}: scraped=${r.scraped}, inserted=${r.inserted}`);
  }

  await prisma.$disconnect();
}

main()
  .then(() => {
    console.log('[TargetedScrape] Script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[TargetedScrape] Fatal error:', err);
    process.exit(1);
  });

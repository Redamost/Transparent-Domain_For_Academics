// Batch scrape V2: target universities with fixed URLs + improved parsing
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';
import { mergePersonSources } from '../src/lib/scraping/normalizer';
import { deduplicatePerson } from '../src/lib/scraping/deduplicator';
import { isValidScrapedPerson } from '../src/lib/scraping/name-validator';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

const TARGETS: { key: string; max: number; reason: string }[] = [
  // NEWLY FIXED URLs (were dead, now verified working)
  { key: 'nwpu', max: 30, reason: 'NEW: szmd.htm (322KB, 3413 CJK)' },
  { key: 'beihang', max: 30, reason: 'NEW: jcrc1.htm (51KB, 1093 CJK)' },
  { key: 'nwafu', max: 30, reason: 'NEW: nwsuaf.edu.cn domain fix (53KB, 2056 CJK)' },
  { key: 'xidian', max: 30, reason: 'NEW: dsjies.htm (124KB, 3039 CJK)' },
  // GARBAGE-NAME fix (now with name blacklist + prefix stripping)
  { key: 'nankai', max: 20, reason: 'Fixed: name blacklist & prefix strip' },
  { key: 'sdu', max: 20, reason: 'Fixed: name blacklist & prefix strip' },
  { key: 'tianjin', max: 20, reason: 'Fixed: name blacklist & prefix strip' },
  { key: 'xmu', max: 20, reason: 'Fixed: name blacklist & prefix strip' },
  { key: 'csu', max: 20, reason: 'Fixed: name blacklist & prefix strip' },
  { key: 'muc', max: 20, reason: 'Fixed: name blacklist & prefix strip' },
  // Previously found links, now with better parsers
  { key: 'hnu', max: 50, reason: 'More data: found 268 links across 3 pages' },
  { key: 'hit', max: 20, reason: 'Fixed: name prefix stripping (副主任苏统华)' },
  { key: 'zju', max: 20, reason: 'Retry: found 2 links before, more pages' },
  { key: 'ustc', max: 20, reason: 'Retry: found 4 links, bad names before' },
];

async function main() {
  const keyFilter = process.argv[2];
  const targets = keyFilter ? TARGETS.filter(t => t.key === keyFilter) : TARGETS;

  console.log(`=== Batch Scrape V2: ${targets.length} universities ===\n`);
  console.log(`Targets: ${targets.map(t => t.key).join(', ')}\n`);

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalRejected = 0;

  for (const { key, max, reason } of targets) {
    console.log(`\n--- ${key} | ${reason} ---`);

    try {
      const start = Date.now();
      const { profiles } = await scrapeUniversity(key, max);
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);

      if (profiles.length === 0) {
        console.log(`  ❌ 0 profiles in ${elapsed}s`);
        continue;
      }

      console.log(`  📊 ${profiles.length} raw profiles in ${elapsed}s`);

      let uniInserted = 0;
      let uniUpdated = 0;
      let uniRejected = 0;

      for (const profile of profiles) {
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
          await prisma.person.update({
            where: { id: dedupResult.existingPersonId },
            data: {
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
        }
      }

      // Show sample of successfully inserted profiles
      if (uniInserted > 0) {
        console.log(`  ✅ Inserted: ${uniInserted}, Updated: ${uniUpdated}, Rejected: ${uniRejected}`);
      } else {
        console.log(`  ⚠️ All rejected: ${uniRejected} (0 inserted, ${uniUpdated} updated)`);
      }
    } catch (err) {
      console.log(`  💀 ERROR: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
    }

    // Delay between universities
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log(`\n=== DONE ===`);
  console.log(`New: ${totalInserted}, Updated: ${totalUpdated}, Rejected: ${totalRejected}`);

  const total = await prisma.person.count({ where: { isActive: true } });
  console.log(`Total scholars in DB: ${total}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

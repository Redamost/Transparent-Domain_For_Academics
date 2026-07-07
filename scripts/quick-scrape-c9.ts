import 'dotenv/config';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';
import { prisma } from '../src/lib/prisma';
import { mergePersonSources } from '../src/lib/scraping/normalizer';
import { deduplicatePerson } from '../src/lib/scraping/deduplicator';
import { isValidScrapedPerson } from '../src/lib/scraping/name-validator';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

async function scrapeAndPersist(key: string, maxProfiles: number) {
  console.log(`\n=== ${key} (max ${maxProfiles}) ===`);
  const start = Date.now();
  const { profiles } = await scrapeUniversity(key, maxProfiles);
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`Scraped ${profiles.length} profiles in ${elapsed}s`);

  let inserted = 0, updated = 0, rejected = 0;

  for (const profile of profiles) {
    const nameCheck = isValidScrapedPerson({
      nameZh: profile.nameZh,
      nameEn: profile.nameEn,
      institution: profile.institution,
    });
    if (!nameCheck.valid) {
      if (rejected < 5) console.warn(`  REJECTED: ${profile.nameZh} — ${nameCheck.reason}`);
      rejected++;
      continue;
    }

    const normalized = mergePersonSources([profile]);
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
      updated++;
    } else {
      await prisma.$transaction(async (tx) => {
        const created = await tx.person.create({
          data: {
            nameZh: normalized.nameZh || profile.nameZh || 'Unknown',
            nameEn: normalized.nameEn,
            alternativeNames: normalized.alternativeNames.length > 0 ? JSON.stringify(normalized.alternativeNames) : null,
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
            metadata: { source: 'CN_UNIVERSITY', confidence: 0.6, scrapedAt: new Date().toISOString(), ...normalized.metadata },
          },
        });
        await initializeScoreBreakdowns(tx, created.id);
      });
      inserted++;
    }
  }

  console.log(`Result: +${inserted} new, ~${updated} updated, ${rejected} rejected`);
  return { inserted, updated, rejected };
}

async function main() {
  let total = 0;

  // ZJU with new redir.php pattern
  console.log('\n--- ZJU (new redir.php pattern) ---');
  const zjuResult = await scrapeAndPersist('zju', 30);
  total += zjuResult.inserted;

  // PKU with new ALL.htm URL
  console.log('\n--- PKU (new ALL.htm URL) ---');
  const pkuResult = await scrapeAndPersist('pku', 30);
  total += pkuResult.inserted;

  console.log(`\n=== DONE: ${total} new scholars ===`);
  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`Total in DB: ${dbTotal}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

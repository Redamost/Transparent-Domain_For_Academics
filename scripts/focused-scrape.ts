// Focused scrape: hnu (more from 268 links) + tsinghua (other depts)
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { scrapeUniversity } from '../src/lib/scraping/cn-university';
import { mergePersonSources } from '../src/lib/scraping/normalizer';
import { deduplicatePerson } from '../src/lib/scraping/deduplicator';
import { isValidScrapedPerson } from '../src/lib/scraping/name-validator';
import { initializeScoreBreakdowns } from '../src/lib/rating/calculator';

async function scrapeAndPersist(key: string, maxProfiles: number) {
  console.log(`\n=== ${key} (max ${maxProfiles} profiles) ===`);
  const start = Date.now();
  const { profiles } = await scrapeUniversity(key, maxProfiles);
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`Scraped ${profiles.length} raw profiles in ${elapsed}s`);

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
      });
      inserted++;
    }
  }

  console.log(`Result: +${inserted} new, ~${updated} updated, ${rejected} rejected`);
  return { inserted, updated, rejected };
}

async function main() {
  let totalInserted = 0;

  // HNU: 268 links found across 3 pages — get 100 profiles
  totalInserted += (await scrapeAndPersist('hnu', 100)).inserted;

  // Tsinghua: try other faculty lists (EE, Automation, SEM)
  totalInserted += (await scrapeAndPersist('tsinghua', 50)).inserted;

  console.log(`\n=== DONE: ${totalInserted} new scholars ===`);
  const total = await prisma.person.count({ where: { isActive: true } });
  console.log(`Total scholars in DB: ${total}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

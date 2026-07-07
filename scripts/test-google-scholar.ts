/**
 * Test script for Google Scholar scraper + enricher.
 * Scrapes 2-3 sample scholars to validate the pipeline.
 *
 * Usage:
 *   npx tsx scripts/test-google-scholar.ts [--save] [--limit=N]
 *   --save   Actually save results to database (default: dry-run, print only)
 *   --limit=N  Number of scholars to test (default: 2)
 */

import { config } from 'dotenv';
config();

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  scrapeScholar,
  getPage,
  getRequestDelay,
  closeBrowser,
} from '../src/lib/scraping/google-scholar';
import type { ScholarProfile } from '../src/lib/scraping/google-scholar';
import { enrichPersonFromScholar } from '../src/lib/scraping/scholar-enricher';

const SHOULD_SAVE = process.argv.includes('--save');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 2;

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Pick scholars with nameEn + institution (good for GS search)
  const candidates = await prisma.person.findMany({
    where: {
      isActive: true,
      nameEn: { not: null },
      institution: { not: null },
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      hIndex: true,
    },
    orderBy: { score: 'desc' },
    take: LIMIT,
  });

  console.log(`Testing Google Scholar scraper with ${candidates.length} scholars`);
  console.log(`Mode: ${SHOULD_SAVE ? 'SAVE to DB' : 'DRY RUN (print only)'}\n`);

  const page = await getPage();
  const profiles: Array<{ candidate: typeof candidates[0]; profile: ScholarProfile | null }> = [];

  try {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      console.log(`[${i + 1}/${candidates.length}] ${c.nameZh} (${c.nameEn}) @ ${c.institution}`);
      console.log(`  Current hIndex: ${c.hIndex ?? 'none'}`);

      const profile = await scrapeScholar(page, c.nameZh, c.nameEn!, c.institution!);
      profiles.push({ candidate: c, profile });

      if (profile) {
        console.log(`  ✅ Found GS profile!`);
        console.log(`     googleScholarId: ${profile.googleScholarId}`);
        console.log(`     nameEn: ${profile.nameEn}`);
        console.log(`     institution: ${profile.institution}`);
        console.log(`     hIndex: ${profile.hIndex}`);
        console.log(`     citationCount: ${profile.citationCount}`);
        console.log(`     i10Index: ${profile.i10Index}`);
        console.log(`     interests: ${profile.interests.join(', ') || 'none'}`);
        console.log(`     publications: ${profile.publications.length}`);
        if (profile.publications.length > 0) {
          console.log(`     Top publications:`);
          profile.publications.slice(0, 5).forEach(p => {
            console.log(`       - ${p.title} (${p.year}, cited ${p.citationCount ?? 0})`);
          });
        }

        if (SHOULD_SAVE) {
          const result = await enrichPersonFromScholar(c.id, profile);
          console.log(`  💾 Saved: papersImported=${result.papersImported} nameUpdated=${result.nameUpdated}`);
        }
      } else {
        console.log(`  ❌ No GS profile found`);
      }

      // Delay between scholars (skip for last)
      if (i < candidates.length - 1) {
        const delay = getRequestDelay();
        console.log(`  ⏳ Waiting ${(delay / 1000).toFixed(0)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    await closeBrowser();
  }

  // Summary
  console.log('\n=== Summary ===');
  const found = profiles.filter(p => p.profile).length;
  console.log(`Tested: ${candidates.length}`);
  console.log(`Found on GS: ${found}`);
  console.log(`Not found: ${candidates.length - found}`);

  if (found > 0) {
    console.log(`\nDetailed results:`);
    for (const { candidate, profile } of profiles) {
      if (profile) {
        console.log(`  ${candidate.nameZh}: h=${profile.hIndex} cites=${profile.citationCount} pubs=${profile.publications.length}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

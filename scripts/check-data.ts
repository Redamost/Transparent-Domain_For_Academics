// ─── Database field completion check ───
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.person.count({ where: { isActive: true } });
  const withDept = await prisma.person.count({ where: { isActive: true, department: { not: null } } });
  const withBio = await prisma.person.count({ where: { isActive: true, bioZh: { not: null } } });
  const withEmail = await prisma.person.count({ where: { isActive: true, email: { not: null } } });
  const withWebsite = await prisma.person.count({ where: { isActive: true, website: { not: null } } });
  const withTitle = await prisma.person.count({ where: { isActive: true, title: { not: null } } });

  // Scraped vs seed
  const scraped = await prisma.person.count({ where: { isActive: true, lastScrapedAt: { not: null } } });
  const seed = await prisma.person.count({ where: { isActive: true, lastScrapedAt: null } });

  console.log("=== Database State ===");
  console.log(`Total active persons: ${total}`);
  console.log(`Scraped: ${scraped} | Seed: ${seed}`);
  console.log(`---`);
  console.log(`With department: ${withDept} (${(withDept/total*100).toFixed(1)}%)`);
  console.log(`With bioZh: ${withBio} (${(withBio/total*100).toFixed(1)}%)`);
  console.log(`With email: ${withEmail} (${(withEmail/total*100).toFixed(1)}%)`);
  console.log(`With website: ${withWebsite} (${(withWebsite/total*100).toFixed(1)}%)`);
  console.log(`With title: ${withTitle} (${(withTitle/total*100).toFixed(1)}%)`);

  // Seed vs scraped breakdown
  console.log(`\n=== Seed Data (no lastScrapedAt) ===`);
  const seedWithDept = await prisma.person.count({ where: { isActive: true, lastScrapedAt: null, department: { not: null } } });
  const seedWithBio = await prisma.person.count({ where: { isActive: true, lastScrapedAt: null, bioZh: { not: null } } });
  const seedWithEmail = await prisma.person.count({ where: { isActive: true, lastScrapedAt: null, email: { not: null } } });
  console.log(`Seed total: ${seed}`);
  console.log(`  department: ${seedWithDept} / bio: ${seedWithBio} / email: ${seedWithEmail}`);

  console.log(`\n=== Scraped Data (has lastScrapedAt) ===`);
  const scrWithDept = await prisma.person.count({ where: { isActive: true, lastScrapedAt: { not: null }, department: { not: null } } });
  const scrWithBio = await prisma.person.count({ where: { isActive: true, lastScrapedAt: { not: null }, bioZh: { not: null } } });
  const scrWithEmail = await prisma.person.count({ where: { isActive: true, lastScrapedAt: { not: null }, email: { not: null } } });
  console.log(`Scraped total: ${scraped}`);
  console.log(`  department: ${scrWithDept} / bio: ${scrWithBio} / email: ${scrWithEmail}`);

  // Scraped with website (can re-scrape)
  const scrWithWeb = await prisma.person.count({ where: { isActive: true, lastScrapedAt: { not: null }, website: { not: null } } });
  console.log(`Scraped with website URL: ${scrWithWeb}`);

  // Scraped missing field AND have website (re-scrapable)
  const scrNoDept = await prisma.person.count({
    where: { isActive: true, lastScrapedAt: { not: null }, department: null, website: { not: null } }
  });
  const scrNoBio = await prisma.person.count({
    where: { isActive: true, lastScrapedAt: { not: null }, bioZh: null, website: { not: null } }
  });
  const scrNoEmail = await prisma.person.count({
    where: { isActive: true, lastScrapedAt: { not: null }, email: null, website: { not: null } }
  });
  console.log(`\nScraped persons with website but missing:`);
  console.log(`  department: ${scrNoDept} / bio: ${scrNoBio} / email: ${scrNoEmail}`);

  // By university
  console.log(`\n=== By Institution ===`);
  const byInst: Array<{institution: string; cnt: number; dept: number; bio: number; email: number}> = await prisma.$queryRaw`
    SELECT
      COALESCE(institution, 'Unknown') as institution,
      COUNT(*)::int as cnt,
      COUNT(department) as dept,
      COUNT(bio_zh) as bio,
      COUNT(email) as email
    FROM "Person"
    WHERE is_active = true
    GROUP BY institution
    ORDER BY cnt DESC
    LIMIT 20
  `;
  for (const row of byInst) {
    console.log(`  ${row.institution}: ${row.cnt} persons (dept:${row.dept}, bio:${row.bio}, email:${row.email})`);
  }

  await prisma.$disconnect();
}

main();

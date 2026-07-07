import { config } from 'dotenv';
config();

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const p = new PrismaClient({ adapter });

  const total = await p.person.count({ where: { isActive: true } });

  const [
    withComp,
    withEval,
    totalComp,
    totalEval,
    withResearch,
    totalResearch,
  ] = await Promise.all([
    p.person.count({ where: { isActive: true, competitionUpdates: { some: {} } } }),
    p.person.count({ where: { isActive: true, evaluationUpdates: { some: {} } } }),
    p.competitionUpdate.count(),
    p.evaluationUpdate.count(),
    p.person.count({ where: { isActive: true, researchUpdates: { some: {} } } }),
    p.researchUpdate.count(),
  ]);

  // Sample some competition updates to check quality
  const compSamples = await p.competitionUpdate.findMany({
    take: 10,
    include: { person: { select: { nameZh: true } } },
  });
  const evalSamples = await p.evaluationUpdate.findMany({
    take: 10,
    include: { person: { select: { nameZh: true } } },
  });

  console.log('=== Competition/Evaluation Data Diagnostics ===\n');
  console.log(`Total active scholars: ${total}`);
  console.log('');
  console.log(`Competition Updates:`);
  console.log(`  Scholars with data: ${withComp} (${(withComp / total * 100).toFixed(1)}%)`);
  console.log(`  Total records: ${totalComp}`);
  console.log('');
  console.log(`Evaluation Updates:`);
  console.log(`  Scholars with data: ${withEval} (${(withEval / total * 100).toFixed(1)}%)`);
  console.log(`  Total records: ${totalEval}`);
  console.log('');
  console.log(`Research Updates (for comparison):`);
  console.log(`  Scholars with data: ${withResearch} (${(withResearch / total * 100).toFixed(1)}%)`);
  console.log(`  Total records: ${totalResearch}`);
  console.log('');

  if (compSamples.length > 0) {
    console.log('=== Sample Competition Updates ===');
    compSamples.forEach(c => {
      console.log(`  [${c.person.nameZh}] ${c.title}`);
      console.log(`    Level: ${c.level || '?'}  Award: ${c.award || '?'}  Source: ${c.source || '?'}`);
    });
    console.log('');
  }

  if (evalSamples.length > 0) {
    console.log('=== Sample Evaluation Updates ===');
    evalSamples.forEach(e => {
      console.log(`  [${e.person.nameZh}] ${e.title}`);
      console.log(`    Type: ${e.evalType || '?'}  Result: ${e.result || '?'}  Source: ${e.source || '?'}`);
    });
    console.log('');
  }

  // Check how many competition/eval records were from seed data vs scraping
  const [
    seedComp,
    seedEval,
  ] = await Promise.all([
    p.competitionUpdate.count({
      where: { source: 'seed' },
    }),
    p.evaluationUpdate.count({
      where: { source: 'seed' },
    }),
  ]);

  console.log('=== Source Breakdown ===');
  console.log(`Competition: seed=${seedComp} scraped=${totalComp - seedComp}`);
  console.log(`Evaluation: seed=${seedEval} scraped=${totalEval - seedEval}`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

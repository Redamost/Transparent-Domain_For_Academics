import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  enrichPersonWithOpenAlex,
  getOpenAlexBacklog,
} from "../src/lib/scraping/openalex-enricher";
import { getBudgetStatus } from "../src/lib/scraping/openalex";

async function main() {
  console.log("=== Bulk OpenAlex Backfill (Budget-Aware) ===\n");

  const initialBacklog = await getOpenAlexBacklog();
  console.log("Initial state:");
  console.log(`  Total active persons: ${initialBacklog.totalEligible}`);
  console.log(`  Already enriched (have hIndex): ${initialBacklog.enriched}`);
  console.log(`  Remaining to enrich: ${initialBacklog.remaining}`);
  console.log("");

  if (initialBacklog.remaining === 0) {
    console.log("All scholars already enriched!");
    await prisma.$disconnect();
    process.exit(0);
  }

  // Check budget first
  const budget = getBudgetStatus();
  console.log(`Budget status: $${budget.remainingUsd.toFixed(4)} remaining`);
  if (!budget.hasBudget) {
    console.log(`Daily budget exhausted! Resets in ${(budget.resetInSeconds / 3600).toFixed(1)} hours.`);
    console.log("Re-run after midnight UTC.");
    await prisma.$disconnect();
    process.exit(0);
  }

  const eligible = await prisma.person.findMany({
    where: {
      isActive: true,
      hIndex: null,
      nameZh: { not: "" },
      institution: { not: "" },
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
    },
    orderBy: { score: "desc" },
  });

  console.log(`Processing up to ${eligible.length} eligible scholars...`);
  console.log(`Estimated cost: ~$${(eligible.length * 2 * 0.001).toFixed(2)} (${eligible.length * 2} API calls at $0.001 each)`);
  console.log(`Note: Daily free budget is $1.00 (~1000 requests). Will stop when budget exhausted.\n`);

  let totalProcessed = 0;
  let totalMatched = 0;
  let totalPapers = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < eligible.length; i++) {
    // Check budget before each scholar
    const budgetStatus = getBudgetStatus();
    if (!budgetStatus.hasBudget) {
      console.log(`\nBudget exhausted ($0 remaining). Stopping.`);
      console.log(`Resets in ${(budgetStatus.resetInSeconds / 3600).toFixed(1)} hours.`);
      console.log(`Re-run this script after midnight UTC to continue.`);
      break;
    }

    const person = eligible[i];

    try {
      const result = await enrichPersonWithOpenAlex(
        person.id,
        person.nameZh,
        person.institution,
        person.nameEn,
      );

      totalProcessed++;
      if (result.matched) totalMatched++;
      totalPapers += result.papersImported;
      if (result.error) errors++;

      if (totalProcessed % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = totalProcessed / elapsed;
        const remaining = Math.min(eligible.length - totalProcessed, Math.floor(budgetStatus.remainingUsd / 0.002));
        const eta = remaining / rate;
        console.log(
          `[${totalProcessed}/${Math.min(eligible.length, totalProcessed + remaining)}] matched=${totalMatched} papers=${totalPapers} errors=${errors} | budget=$${budgetStatus.remainingUsd.toFixed(3)} | ${rate.toFixed(2)}/s | ETA: ${(eta/60).toFixed(0)}m`,
        );
      }
    } catch (err) {
      errors++;
      totalProcessed++;
      if (errors % 10 === 0) {
        console.warn(`  Errors so far: ${errors}`);
      }
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log("\n=== Complete ===");
  console.log("Processed: " + totalProcessed);
  console.log("Matched: " + totalMatched + " (" + (totalMatched/Math.max(1,totalProcessed)*100).toFixed(1) + "%)");
  console.log("Papers imported: " + totalPapers);
  console.log("Errors: " + errors);
  console.log("Time: " + (totalTime/60).toFixed(1) + " minutes");

  const [total, withHIndex, pubCount, scholarsWithPubs] = await Promise.all([
    prisma.person.count({ where: { isActive: true } }),
    prisma.person.count({ where: { isActive: true, hIndex: { not: null } } }),
    prisma.publication.count(),
    prisma.person.count({ where: { isActive: true, publications: { some: {} } } }),
  ]);

  console.log("\nFinal stats:");
  console.log("  hIndex coverage: " + withHIndex + "/" + total + " (" + (withHIndex/total*100).toFixed(1) + "%)");
  console.log("  Total publications: " + pubCount);
  console.log("  Scholars with papers: " + scholarsWithPubs + "/" + total + " (" + (scholarsWithPubs/total*100).toFixed(1) + "%)");

  const budgetFinal = getBudgetStatus();
  console.log(`\nRemaining budget: $${budgetFinal.remainingUsd.toFixed(4)}`);
  if (!budgetFinal.hasBudget) {
    console.log(`Budget fully used. Resets in ~${(budgetFinal.resetInSeconds / 3600).toFixed(1)} hours.`);
  }

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Fatal:", err); process.exit(1); });

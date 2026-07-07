import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { inferFieldsFromSource } from "../src/lib/scraping/field-inference";

async function main() {
  // Sample unique sourceUrls from field-less scholars
  const persons = await prisma.person.findMany({
    where: { isActive: true, fields: { none: {} } },
    select: { metadata: true },
    take: 500,
  });

  const urlCounts = new Map<string, number>();
  const unmatchedUrls = new Set<string>();

  for (const p of persons) {
    const meta = (p.metadata || {}) as Record<string, unknown>;
    const url = typeof meta.sourceUrl === "string" ? meta.sourceUrl : "NULL";

    // Extract host+first path segment
    let host = url;
    try {
      const m = url.match(/https?:\/\/([^\/]+)(\/[^\/]*)?/);
      if (m) host = m[1] + (m[2] || "");
    } catch {}

    urlCounts.set(host, (urlCounts.get(host) || 0) + 1);

    const fields = inferFieldsFromSource(null, url);
    if (fields.length === 0) {
      unmatchedUrls.add(url);
    }
  }

  // Show top URL patterns
  console.log("Top source URL patterns (first 20):");
  const sorted = Array.from(urlCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [url, count] of sorted.slice(0, 20)) {
    console.log(`  ${count}x  ${url}`);
  }

  console.log(`\nUnmatched URL count: ${unmatchedUrls.size} unique URLs`);
  console.log("Sample unmatched URLs:");
  const samples = Array.from(unmatchedUrls).slice(0, 15);
  for (const url of samples) {
    console.log(`  ${url}`);
  }

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  // Check what metadata exists for field-less scholars
  const sample = await prisma.person.findMany({
    where: { isActive: true, fields: { none: {} } },
    select: { id: true, nameZh: true, metadata: true },
    take: 10,
  });

  for (const p of sample) {
    const meta = p.metadata as any;
    console.log(`"${p.nameZh}" | meta keys: ${meta ? Object.keys(meta).join(", ") : "NULL"}`);
    if (meta) {
      console.log(`  source: ${meta.source || "N/A"} | sourceUrl: ${meta.sourceUrl || "N/A"} | universityKey: ${meta.universityKey || "N/A"} | scrapedAt: ${meta.scrapedAt || "N/A"}`);
    }
  }

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

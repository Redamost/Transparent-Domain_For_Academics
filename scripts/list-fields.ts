import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const fields = await prisma.field.findMany({
    include: { _count: { select: { persons: true } } },
    orderBy: { persons: { _count: "desc" } },
  });
  console.log("Total fields:", fields.length);
  console.log("");
  for (const f of fields) {
    console.log(`${f.slug} | ${f.nameZh} | level:${f.level} | persons:${f._count.persons}`);
  }
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

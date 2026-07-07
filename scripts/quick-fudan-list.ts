import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const all = await prisma.person.findMany({
    where: { institution: '复旦大学', isActive: true },
    select: { nameZh: true, title: true, email: true },
    orderBy: { nameZh: 'asc' },
  });
  console.log(`All ${all.length} Fudan entries:`);
  const groups: Record<string, number> = {};
  for (const p of all) {
    const n = p.nameZh || '?';
    groups[n] = (groups[n] || 0) + 1;
  }
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    const mark = /^[一-鿿]{2,4}$/.test(name) ? '✅' : '❌';
    console.log(`  ${mark} ${count}x ${name}`);
  }
  const realCount = sorted.filter(([n]) => /^[一-鿿]{2,4}$/.test(n)).reduce((s, [,c]) => s + c, 0);
  console.log(`\nReal names: ${realCount}/${all.length}`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

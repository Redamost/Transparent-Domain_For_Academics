import { config } from 'dotenv';
config();

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const p = new PrismaClient({ adapter });

  const total = await p.person.count({ where: { isActive: true } });
  const hasNameEn = await p.person.count({ where: { isActive: true, nameEn: { not: null } } });
  const hasHIndex = await p.person.count({ where: { isActive: true, hIndex: { not: null } } });

  console.log(JSON.stringify({
    total,
    hasNameEn,
    nameEnPct: (hasNameEn / total * 100).toFixed(1) + '%',
    hasHIndex,
    hIndexPct: (hasHIndex / total * 100).toFixed(1) + '%',
  }, null, 2));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

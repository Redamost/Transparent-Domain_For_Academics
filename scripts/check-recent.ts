import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const recent = await prisma.person.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { id: true, nameZh: true, nameEn: true, institution: true },
  });
  for (const p of recent) {
    console.log(`${p.id} | ${p.nameZh} | ${p.nameEn || '-'} | ${p.institution || '-'}`);
  }
  const total = await prisma.person.count();
  console.log(`\nTotal persons: ${total}`);
  await prisma.$disconnect();
}

main();

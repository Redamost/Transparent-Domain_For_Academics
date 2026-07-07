// Quick DB stats — run with: npx tsx scripts/_stats.ts
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/transparent_domain?schema=public',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const total = await prisma.person.count({ where: { isActive: true } });
    const withOrcid = await prisma.person.count({
      where: { isActive: true, orcidId: { not: null } },
    });
    const withEmail = await prisma.person.count({
      where: { isActive: true, email: { not: null } },
    });
    const withHIndex = await prisma.person.count({
      where: { isActive: true, hIndex: { not: null } },
    });
    const withPubs = await prisma.person.count({
      where: { isActive: true, publications: { some: {} } },
    });
    const totalPubs = await prisma.publication.count();
    const totalUpdates = await prisma.researchUpdate.count();

    console.log('=== Database Stats ===');
    console.log(`Total persons: ${total}`);
    console.log(`With ORCID: ${withOrcid}`);
    console.log(`With email: ${withEmail}`);
    console.log(`With h-index: ${withHIndex}`);
    console.log(`With publications: ${withPubs}`);
    console.log(`Total publications: ${totalPubs}`);
    console.log(`Total research updates: ${totalUpdates}`);

    // Recent persons with ORCID
    console.log('\n=== Recent persons with ORCID ===');
    const recent = await prisma.person.findMany({
      where: { isActive: true, orcidId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        nameEn: true,
        nameZh: true,
        institution: true,
        orcidId: true,
        email: true,
        hIndex: true,
        _count: { select: { publications: true } },
      },
    });
    for (const p of recent) {
      console.log(`  ${p.nameEn || p.nameZh} | inst=${p.institution || 'N/A'} | h=${p.hIndex} | pubs=${p._count.publications} | email=${p.email || 'N/A'}`);
    }

    // Persons with email
    console.log('\n=== Persons with email ===');
    const withEmails = await prisma.person.findMany({
      where: { isActive: true, email: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        nameEn: true,
        institution: true,
        email: true,
        orcidId: true,
      },
    });
    for (const p of withEmails) {
      console.log(`  ${p.nameEn || 'N/A'} | ${p.email} | ${p.institution || 'N/A'}`);
    }

    await prisma.$disconnect();
  } catch (e: any) {
    console.error('Failed:', e.message);
    try { await prisma.$disconnect(); } catch {}
  }
}

main();

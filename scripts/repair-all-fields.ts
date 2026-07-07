import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { inferFields, inferFieldsFromPublications, inferFieldsFromDepartment, inferFieldsFromSource, inferFieldsFromResearchText } from "../src/lib/scraping/field-inference";

async function main() {
  console.log("=== Comprehensive Field Repair ===\n");

  // ── Phase 1: Scholars with publications but no fields ──
  console.log("Phase 1: Scholars with publications but no fields...");
  const withPubsNoFields = await prisma.person.findMany({
    where: {
      isActive: true,
      fields: { none: {} },
      publications: { some: {} },
    },
    select: {
      id: true,
      nameZh: true,
      department: true,
      institution: true,
      bioZh: true,
      publications: { select: { title: true }, take: 10 },
      metadata: true,
    },
  });

  console.log(`  Found ${withPubsNoFields.length} scholars with publications but no fields`);

  let phase1Assigned = 0;
  for (const p of withPubsNoFields) {
    const meta = p.metadata as any;
    const fields = inferFields({
      publications: p.publications,
      department: p.department,
      bio: p.bioZh,
      institution: p.institution,
      sourceUrl: meta?.sourceUrl || null,
    });

    if (fields.length > 0) {
      const fieldRecords = await prisma.field.findMany({
        where: { slug: { in: fields } },
        select: { id: true, slug: true },
      });

      if (fieldRecords.length > 0) {
        await prisma.personField.createMany({
          data: fieldRecords.map((f, i) => ({
            personId: p.id,
            fieldId: f.id,
            isPrimary: i === 0,
          })),
          skipDuplicates: true,
        });
        phase1Assigned++;
      }
    }
  }
  console.log(`  → Assigned fields to ${phase1Assigned} scholars\n`);

  // ── Phase 2: Scholars with department but no fields ──
  console.log("Phase 2: Scholars with department but no fields...");
  const withDeptNoFields = await prisma.person.findMany({
    where: {
      isActive: true,
      fields: { none: {} },
      department: { not: null },
      id: { notIn: withPubsNoFields.map(p => p.id) },
    },
    select: {
      id: true,
      nameZh: true,
      department: true,
      institution: true,
      metadata: true,
    },
  });

  console.log(`  Found ${withDeptNoFields.length} scholars with department but no fields`);

  let phase2Assigned = 0;
  for (const p of withDeptNoFields) {
    const fields = inferFields({
      department: p.department,
      institution: p.institution,
    });

    if (fields.length > 0) {
      const fieldRecords = await prisma.field.findMany({
        where: { slug: { in: fields } },
        select: { id: true, slug: true },
      });

      if (fieldRecords.length > 0) {
        await prisma.personField.createMany({
          data: fieldRecords.map((f, i) => ({
            personId: p.id,
            fieldId: f.id,
            isPrimary: i === 0,
          })),
          skipDuplicates: true,
        });
        phase2Assigned++;
      }
    }
  }
  console.log(`  → Assigned fields to ${phase2Assigned} scholars\n`);

  // ── Phase 3: Scholars with sourceUrl but no fields ──
  console.log("Phase 3: Scholars with sourceUrl but no fields...");
  const allFieldless = await prisma.person.findMany({
    where: {
      isActive: true,
      fields: { none: {} },
      id: { notIn: [...withPubsNoFields.map(p => p.id), ...withDeptNoFields.map(p => p.id)] },
    },
    select: { id: true, nameZh: true, institution: true, metadata: true },
  });

  let phase3Assigned = 0;
  for (const p of allFieldless) {
    const meta = p.metadata as any;
    if (!meta?.sourceUrl) continue;

    const fields = inferFields({
      sourceUrl: meta.sourceUrl,
      institution: p.institution,
    });

    if (fields.length > 0) {
      const fieldRecords = await prisma.field.findMany({
        where: { slug: { in: fields } },
        select: { id: true, slug: true },
      });

      if (fieldRecords.length > 0) {
        await prisma.personField.createMany({
          data: fieldRecords.map((f, i) => ({
            personId: p.id,
            fieldId: f.id,
            isPrimary: i === 0,
          })),
          skipDuplicates: true,
        });
        phase3Assigned++;
      }
    }
  }
  console.log(`  → Assigned fields to ${phase3Assigned} scholars via URL\n`);

  // ── Final stats ──
  const [total, withFields] = await Promise.all([
    prisma.person.count({ where: { isActive: true } }),
    prisma.person.count({ where: { isActive: true, fields: { some: {} } } }),
  ]);

  console.log(`=== Complete ===`);
  console.log(`Total active: ${total}`);
  console.log(`With fields: ${withFields} (${(withFields/total*100).toFixed(1)}%)`);
  console.log(`Still without fields: ${total - withFields}`);

  await prisma.$disconnect();
}

main();

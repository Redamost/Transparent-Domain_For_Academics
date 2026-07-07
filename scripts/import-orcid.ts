// ─── ORCID Fast Import (JSON API) ───
// Bulk imports real researchers from ORCID using the JSON API.
// Uses only JSON responses — no DOM/XML parsing needed.
// Google Scholar & ResearchGate are often unreachable from China,
// but ORCID's public API works everywhere.
//
// Usage: npx tsx scripts/import-orcid.ts

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MAX_PER_FIELD = 8;
const MAX_FIELDS = 10;

// ─── Helpers ───

const ORCID_BASE = 'https://pub.orcid.org/v3.0';
const UA = 'TransparentDomain/1.0 (mailto:admin@transparent-domain.org)';

let lastReq = 0;
async function wait(): Promise<void> {
  const e = Date.now() - lastReq;
  if (e < 1100) await new Promise((r) => setTimeout(r, 1100 - e));
  lastReq = Date.now();
}

async function orcidFetch(path: string): Promise<any> {
  await wait();
  const r = await fetch(`${ORCID_BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (r.status === 301 || r.status === 302) {
    const loc = r.headers.get('location');
    if (loc) {
      await wait();
      const r2 = await fetch(loc, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      });
      if (!r2.ok) throw new Error(`Redirect HTTP ${r2.status}`);
      return r2.json();
    }
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Search ───

async function searchOrcid(query: string, rows = 20): Promise<string[]> {
  const data = await orcidFetch(`/search/?q=${encodeURIComponent(query)}&rows=${rows}`);
  if (!data.result) return [];
  return data.result.map(
    (r: any) => r['orcid-identifier']?.path || ''
  ).filter(Boolean) as string[];
}

// ─── Record Parsing (JSON) ───

interface ParsedRecord {
  nameZh: string | null;
  nameEn: string | null;
  institution: string | null;
  bio: string | null;
  email: string | null;
  keywords: string[];
  publications: { title: string; journal: string | null; year: number | null; doi: string | null }[];
}

function parseJsonRecord(data: any): ParsedRecord {
  const person = data?.person;
  const name = person?.name;
  const given = name?.['given-names']?.value || '';
  const family = name?.['family-name']?.value || '';
  const creditName = name?.['credit-name']?.value || null;
  const nameEn = creditName || `${given} ${family}`.trim() || null;

  // Chinese name from other-names
  let nameZh: string | null = null;
  for (const on of name?.['other-names']?.['other-name'] || []) {
    const c = on?.content || '';
    if (/[一-鿿]/.test(c)) { nameZh = c; break; }
  }

  // Bio
  const bio = person?.biography?.content || null;

  // Email
  const emails = person?.emails?.email || [];
  const primary = emails.find((e: any) => e.primary || e.verified) || emails[0];
  const email = primary?.email || null;

  // Institution (current employment)
  const activities = data?.['activities-summary'];
  const employments = activities?.employments?.['employment-summary'] || [];
  const currentEmployment = Array.isArray(employments)
    ? employments[0]
    : employments;
  const institution = currentEmployment?.organization?.name || null;

  // Keywords
  const keywords = (person?.keywords?.keyword || []).map((k: any) =>
    (k.content || '').toLowerCase().replace(/\s+/g, '_')
  ).filter((f: string) => f.length > 1);

  // Publications
  const publications: ParsedRecord['publications'] = [];
  const works = activities?.works?.group || [];
  for (const group of works) {
    const summaries = group?.['work-summary'] || [];
    for (const ws of summaries) {
      const title = ws?.title?.title?.value;
      if (!title) continue;
      const journal = ws?.['journal-title']?.value || null;
      const yearVal = ws?.['publication-date']?.year?.value;
      const year = yearVal ? parseInt(yearVal) : null;
      const extIds = ws?.['external-ids']?.['external-id'] || [];
      const doi = extIds.find((e: any) => e?.['external-id-type'] === 'doi')?.['external-id-value'] || null;
      publications.push({ title, journal, year, doi });
    }
  }

  return { nameZh, nameEn, institution, bio, email, keywords, publications };
}

// ─── Main ───

async function main() {
  console.log('=== ORCID JSON Import ===\n');

  const fields = await prisma.field.findMany({
    orderBy: { sortOrder: 'asc' },
    take: MAX_FIELDS,
    select: { id: true, slug: true, nameEn: true, nameZh: true },
  });

  console.log(`Searching ${fields.length} fields on ORCID...\n`);

  let totalImported = 0;

  for (const field of fields) {
    console.log(`── ${field.nameEn} ──`);

    try {
      const ids = await searchOrcid(field.nameEn, MAX_PER_FIELD);
      console.log(`  Search: ${ids.length} IDs found`);

      for (const orcidId of ids) {
        // Dedup check
        const exists = await prisma.person.findFirst({
          where: { isActive: true, orcidId },
          select: { id: true },
        });
        if (exists) { console.log(`  ⏭ ${orcidId} (exists)`); continue; }

        try {
          console.log(`  ↓ ${orcidId}`);
          const record = await orcidFetch(`/${orcidId}/record`);
          const p = parseJsonRecord(record);

          await prisma.$transaction(async (tx) => {
            const person = await tx.person.create({
              data: {
                nameZh: p.nameZh || p.nameEn || 'Unknown',
                nameEn: p.nameEn,
                institution: p.institution,
                orcidId,
                email: p.email,
                bioEn: p.bio,
                lastScrapedAt: new Date(),
                isVerified: true,
                metadata: { source: 'ORCID_IMPORT', importedAt: new Date().toISOString() },
              },
            });

            await tx.personField.create({
              data: { personId: person.id, fieldId: field.id, isPrimary: true },
            });

            for (const pub of p.publications.slice(0, 20)) {
              if (pub.doi) {
                const dup = await tx.publication.findUnique({ where: { doi: pub.doi } });
                if (dup) continue;
              }
              await tx.publication.create({
                data: {
                  personId: person.id,
                  title: pub.title,
                  journal: pub.journal,
                  year: pub.year,
                  doi: pub.doi,
                  source: 'ORCID',
                  publishedAt: pub.year ? new Date(pub.year, 0, 1) : null,
                },
              });
            }

            console.log(`  ✓ ${p.nameEn || p.nameZh} [${p.publications.length} pubs]`);
          });

          totalImported++;
        } catch (err) {
          console.error(`  ✗ ${orcidId}: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      console.error(`  Field error: ${err instanceof Error ? err.message : err}`);
    }

    console.log();
  }

  // Update stats
  const count = await prisma.person.count({ where: { isActive: true } });
  console.log(`=== Done ===`);
  console.log(`New imports: ${totalImported}`);
  console.log(`Total active: ${count}`);
}

main()
  .catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

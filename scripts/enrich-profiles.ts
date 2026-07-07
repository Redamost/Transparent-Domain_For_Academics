// ─── Profile Data Enrichment ───
// Re-scrapes existing scholars' profile pages to fill in missing fields:
// department (院系), bioZh (概览), email (联系方式).
//
// Usage: npx tsx scripts/enrich-profiles.ts [--dry-run] [--limit=N]

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { fetchAndParseProfile, getUniversityConfig } from '../src/lib/scraping/cn-university';

// ─── Config ───
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_PERSONS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const DELAY_MS = 2000; // Between requests to same university

interface EnrichResult {
  personId: string;
  nameZh: string;
  university: string;
  url: string;
  found: { department?: string; bio?: string; email?: string };
  errors: string[];
}

// ─── University key lookup by institution name ───
function guessUniversityKey(institution: string | null): string | null {
  if (!institution) return null;
  const KEY_MAP: Record<string, string> = {
    '武汉大学': 'whu',
    '中山大学': 'sysu',
    '吉林大学': 'jlu',
    '湖南大学': 'hnu',
    '哈尔滨工业大学': 'hit',
    '上海交通大学': 'sjtu',
    '复旦大学': 'fudan',
    '清华大学': 'tsinghua',
    '北京大学': 'pku',
    '浙江大学': 'zju',
    '南京大学': 'nju',
    '中国科学技术大学': 'ustc',
    '西安交通大学': 'xjtu',
    '华中科技大学': 'hust',
    '同济大学': 'tongji',
    '北京航空航天大学': 'beihang',
    '四川大学': 'sichuan',
    '东南大学': 'seu',
    '中国人民大学': 'ruc',
    '南开大学': 'nankai',
    '天津大学': 'tianjin',
    '北京理工大学': 'bit',
    '大连理工大学': 'dlut',
    '山东大学': 'sdu',
    '厦门大学': 'xmu',
    '兰州大学': 'lzu',
    '西北工业大学': 'nwpu',
    '华南理工大学': 'scut',
    '中南大学': 'csu',
    '东北大学': 'neu',
    '重庆大学': 'cqu',
    '华东师范大学': 'ecnu',
    '北京师范大学': 'bnu',
    '电子科技大学': 'uestc',
    '中国科学院': 'cas',
  };
  return KEY_MAP[institution] || null;
}

async function main() {
  console.log(`[Enrich] Starting profile enrichment${DRY_RUN ? ' (DRY RUN)' : ''}`);
  if (MAX_PERSONS < Infinity) console.log(`[Enrich] Limit: ${MAX_PERSONS} persons`);

  // ─── Find persons with missing data ───
  const candidates = await prisma.person.findMany({
    where: {
      isActive: true,
      website: { not: null },
      OR: [
        { department: null },
        { bioZh: null },
        { email: null },
      ],
    },
    select: {
      id: true,
      nameZh: true,
      institution: true,
      website: true,
      department: true,
      bioZh: true,
      email: true,
    },
    orderBy: { institution: 'asc' },
    take: MAX_PERSONS < Infinity ? MAX_PERSONS : undefined,
  });

  console.log(`[Enrich] Found ${candidates.length} candidates with missing data`);

  // Count by university
  const byUni = new Map<string, number>();
  for (const c of candidates) {
    const key = c.institution || 'Unknown';
    byUni.set(key, (byUni.get(key) || 0) + 1);
  }
  console.log(`[Enrich] Distribution:`);
  for (const [uni, count] of [...byUni.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${uni}: ${count}`);
  }

  // ─── Process each person ───
  const results: EnrichResult[] = [];
  let processed = 0;
  let enriched = 0;
  const lastRequestMap = new Map<string, number>();

  for (const person of candidates) {
    processed++;
    const uniKey = guessUniversityKey(person.institution);

    if (!person.website) {
      results.push({
        personId: person.id,
        nameZh: person.nameZh,
        university: person.institution || 'Unknown',
        url: 'N/A',
        found: {},
        errors: ['No website URL'],
      });
      continue;
    }

    // Rate limit per university
    if (uniKey) {
      const now = Date.now();
      const last = lastRequestMap.get(uniKey) || 0;
      const elapsed = now - last;
      if (elapsed < DELAY_MS) {
        await new Promise(r => setTimeout(r, DELAY_MS - elapsed));
      }
      lastRequestMap.set(uniKey, Date.now());
    }

    // Status line
    const missingLabels: string[] = [];
    if (!person.department) missingLabels.push('dept');
    if (!person.bioZh) missingLabels.push('bio');
    if (!person.email) missingLabels.push('email');
    const status = `[${processed}/${candidates.length}] ${person.nameZh} (${person.institution || '?'}) missing:${missingLabels.join(',')}`;

    try {
      // Determine university key for parser
      if (!uniKey) {
        // Skip — no parser available
        results.push({
          personId: person.id,
          nameZh: person.nameZh,
          university: person.institution || 'Unknown',
          url: person.website,
          found: {},
          errors: ['Unknown university — no parser'],
        });
        console.log(`${status} → SKIP (unknown university)`);
        continue;
      }

      // Fetch and parse
      const parsed = await fetchAndParseProfile(person.website, uniKey);

      if (!parsed || !parsed.nameZh) {
        results.push({
          personId: person.id,
          nameZh: person.nameZh,
          university: person.institution || 'Unknown',
          url: person.website,
          found: {},
          errors: ['Profile page fetch/parse failed'],
        });
        console.log(`${status} → FAIL (fetch/parse)`);
        continue;
      }

      // Determine what we found that was previously missing
      const found: { department?: string; bio?: string; email?: string } = {};
      const updates: Record<string, string> = {};

      if (!person.department && parsed.department) {
        found.department = parsed.department;
        updates.department = parsed.department;
      }
      if (!person.bioZh && parsed.bio) {
        found.bio = parsed.bio.slice(0, 80) + '...';
        updates.bioZh = parsed.bio.slice(0, 1000);
      }
      if (!person.email && parsed.email) {
        found.email = parsed.email;
        updates.email = parsed.email;
      }

      if (Object.keys(updates).length > 0) {
        if (!DRY_RUN) {
          await prisma.person.update({
            where: { id: person.id },
            data: {
              ...updates,
              lastScrapedAt: new Date(),
            },
          });
        }
        enriched++;
        const foundLabels: string[] = [];
        if (found.department) foundLabels.push(`dept="${found.department}"`);
        if (found.bio) foundLabels.push(`bio="${found.bio}"`);
        if (found.email) foundLabels.push(`email="${found.email}"`);
        console.log(`${status} → ENRICHED: ${foundLabels.join(', ')}`);
      } else {
        console.log(`${status} → NO NEW DATA`);
      }

      results.push({
        personId: person.id,
        nameZh: person.nameZh,
        university: person.institution || 'Unknown',
        url: person.website,
        found,
        errors: [],
      });
    } catch (err) {
      results.push({
        personId: person.id,
        nameZh: person.nameZh,
        university: person.institution || 'Unknown',
        url: person.website || 'N/A',
        found: {},
        errors: [err instanceof Error ? err.message : String(err)],
      });
      console.log(`${status} → ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── Summary ───
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Enrich] COMPLETE${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`[Enrich] Processed: ${processed} | Enriched: ${enriched} | No change: ${processed - enriched - results.filter(r => r.errors.length > 0).length} | Errors: ${results.filter(r => r.errors.length > 0).length}`);

  // Breakdown by field
  const deptFilled = results.filter(r => r.found.department).length;
  const bioFilled = results.filter(r => r.found.bio).length;
  const emailFilled = results.filter(r => r.found.email).length;
  console.log(`[Enrich] Fields filled: department=${deptFilled}, bio=${bioFilled}, email=${emailFilled}`);

  // Log to audit
  if (!DRY_RUN && enriched > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'PROFILE_ENRICHMENT',
        entityType: 'SYSTEM',
        newData: {
          processed,
          enriched,
          deptFilled,
          bioFilled,
          emailFilled,
        },
      },
    });
  }

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Enrich] Fatal:', err);
    process.exit(1);
  });

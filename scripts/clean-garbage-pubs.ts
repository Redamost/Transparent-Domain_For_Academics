// ─── Clean Garbage Publications ───
// Many scraped "publications" are actually descriptive text like:
// "在国内外期刊和会议上发表论文20多篇"
// This script detects and removes them.
//
// Usage: npx tsx scripts/clean-garbage-pubs.ts [--dry-run]

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

// Patterns that indicate garbage/non-publication text
const GARBAGE_PATTERNS = [
  // "发表论文XX篇" pattern
  /发表.{0,5}论文\s*\d+\s*[篇余多]/,
  /发表.{0,5}[论著].{0,10}\d+\s*[篇余多]/,
  // "在...发表..." without specific paper info
  /^在.{0,10}(国内外|期刊|会议|刊物).{0,5}发表.{0,5}\d+\s*[篇余多]/,
  // Pure summary statements
  /^.{0,10}(共计|累计|已|共|合计).{0,5}(发表|出版).{0,10}\d+\s*[篇余多部]/,
  /^(在|于).{0,20}(发表|刊出|出版).{0,5}\d+\s*[篇余多]/,
  // Count patterns only
  /^.{0,5}(SCI|EI|ISTP|SSCI|CSSCI|CSCD).{0,5}(收录|检索|论文).{0,10}\d+\s*[篇余多]/,
  /^\d+\s*[篇余多].*(SCI|EI|论文)/,
  // Too short with count
  /^(发表|出版).{0,10}\d+\s*[篇余多部]/,
  // "论文XX余篇，其中..."
  /^论文\s*\d+\s*[余多]?\s*[篇项]/,
  /^(共|合计|已|累计)?.{0,5}(在|于)?(国内外|核心|权威|重要).{0,10}(期刊|刊物|杂志|会议).{0,10}(发表|刊出)/,
  // Generic "科研项目" text mistaken as publication
  /^(主持|参与|承担|负责).{0,5}(国家|省|部|校).{0,5}(项目|课题|基金)/,
  // ESI / Altmetric mentions
  /^.{0,10}ESI\s*(高被引|热点)/,
  /^.{0,10}Altmetric/,
  // Software copyright / patents mistaken as publications
  /^(取得|获得|拥有).{0,5}(软件著作权|专利)/,
  // Short non-specific text (less than 30 chars, no paper-like structure)
];

function isGarbagePublication(title: string): { isGarbage: boolean; reason: string } {
  // Too short = likely garbage
  if (title.length < 15) {
    return { isGarbage: true, reason: 'too short (< 15 chars)' };
  }

  // Title looks like a real paper: contains journal-like markers
  const hasPaperStructure = (
    /[\[（(]\s*(19|20)\d{2}\s*[\]）)]/.test(title) || // year in brackets
    /\b(Journal|IEEE|ACM|Nature|Science|Cell|Proc\.|Proceedings|Conference|Symposium|Trans\.|Transactions)\b/i.test(title) ||
    /\bvol\.?\s*\d+/i.test(title) ||
    /\bdoi\s*:/i.test(title) ||
    /\bpp\.\s*\d+/i.test(title) ||
    // Chinese journal patterns
    /[（(]\s*(19|20)\d{2}\s*[)）]/.test(title) ||
    /[（(]\d+[)）]\s*[:：]/.test(title) ||
    /\d+\(\d+\)\s*[:：]/.test(title) || // vol(issue): pages
    /[《「]\s*.{2,30}\s*[》」]/.test(title) // 《Journal Name》
  );

  if (hasPaperStructure) {
    return { isGarbage: false, reason: 'has paper structure' };
  }

  // Check against garbage patterns
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(title)) {
      return { isGarbage: true, reason: `matches garbage pattern: ${pattern.source.slice(0, 60)}` };
    }
  }

  // If title is long enough (>60 chars) and doesn't match garbage, it might be real
  if (title.length >= 60) {
    return { isGarbage: false, reason: 'long enough and no garbage patterns' };
  }

  // Edge case: medium-length text - check Chinese character ratio and paper clues
  const chineseRatio = (title.match(/[一-鿿]/g) || []).length / title.length;

  // Real Chinese papers usually have specific structural clues
  const hasPaperClue = (
    /\d{4}/.test(title) || // has a year
    /\.\s*[A-Z]/.test(title) || // has author initials
    /[《「]/.test(title) || // has book/article title markers
    /\b(基于|一种|新型|面向|改进|融合|结合|利用|采用)\b/.test(title) // Chinese paper title opener patterns
  );

  // If >75% Chinese and no paper clues, likely garbage
  if (chineseRatio > 0.75 && !hasPaperClue) {
    return { isGarbage: true, reason: 'high Chinese ratio, no paper clues' };
  }

  return { isGarbage: false, reason: 'passes basic checks' };
}

async function main() {
  console.log(`[CleanPubs] Scanning for garbage publications${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // Get all scraper-sourced publications
  const pubs = await prisma.publication.findMany({
    where: { source: 'SCRAPER' },
    select: { id: true, title: true, personId: true, person: { select: { nameZh: true, institution: true } } },
  });

  console.log(`[CleanPubs] Total SCRAPER publications: ${pubs.length}`);

  const toDelete: Array<{ id: string; title: string; personName: string; reason: string }> = [];

  for (const pub of pubs) {
    const result = isGarbagePublication(pub.title);
    if (result.isGarbage) {
      toDelete.push({
        id: pub.id,
        title: pub.title.slice(0, 100),
        personName: pub.person.nameZh,
        reason: result.reason,
      });
    }
  }

  console.log(`[CleanPubs] Garbage found: ${toDelete.length} / ${pubs.length} (${(toDelete.length/pubs.length*100).toFixed(1)}%)`);

  // Show samples
  console.log('\n=== 垃圾论文样本 ===');
  for (const item of toDelete.slice(0, 20)) {
    console.log(`  [${item.personName}] "${item.title}"`);
    console.log(`    Reason: ${item.reason}`);
  }

  if (!DRY_RUN && toDelete.length > 0) {
    console.log(`\n[CleanPubs] Deleting ${toDelete.length} garbage publications...`);
    const ids = toDelete.map(d => d.id);

    // Delete in batches
    const BATCH = 50;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      await prisma.publication.deleteMany({
        where: { id: { in: batch } },
      });
      console.log(`  Deleted batch ${i / BATCH + 1}/${Math.ceil(ids.length / BATCH)}`);
    }

    console.log(`[CleanPubs] Deleted ${toDelete.length} garbage publications`);
  }

  // Summary
  const remaining = pubs.length - toDelete.length;
  console.log(`\n[CleanPubs] Remaining SCRAPER publications: ${remaining}`);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

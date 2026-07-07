// ─── Sample profile pages to understand HTML structure ───
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { fetchAndParseProfile, getUniversityConfig } from '../src/lib/scraping/cn-university';

async function main() {
  // Get sample profile URLs from each major university group
  const universities = [
    { key: 'whu', name: '武汉大学' },
    { key: 'sysu', name: '中山大学' },
    { key: 'jlu', name: '吉林大学' },
    { key: 'hnu', name: '湖南大学' },
  ];

  for (const uni of universities) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`=== ${uni.name} (${uni.key}) ===`);

    // Get 2 sample persons from this university
    const persons = await prisma.person.findMany({
      where: {
        isActive: true,
        institution: uni.name,
        website: { not: null },
      },
      select: { id: true, nameZh: true, website: true, department: true, bioZh: true, email: true },
      take: 2,
    });

    for (const person of persons) {
      console.log(`\n--- ${person.nameZh} ---`);
      console.log(`URL: ${person.website}`);
      console.log(`Current: dept=${person.department || 'NULL'}, bio=${(person.bioZh || 'NULL').slice(0, 60)}, email=${person.email || 'NULL'}`);

      if (person.website) {
        try {
          const uConfig = getUniversityConfig(uni.key);
          const encoding = uConfig?.encoding || 'utf-8';

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(person.website, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'zh-CN,zh;q=0.9',
            },
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (!response.ok) {
            console.log(`  HTTP ${response.status} — SKIPPED`);
            continue;
          }

          const buffer = await response.arrayBuffer();
          const contentType = response.headers.get('content-type') || '';
          console.log(`  Content-Type: ${contentType}`);
          console.log(`  Size: ${(buffer.byteLength / 1024).toFixed(1)} KB`);

          // Decode with proper encoding
          let html: string;
          const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
          if (charsetMatch) {
            const rawCharset = charsetMatch[1].toLowerCase().replace(/[,;].*$/, '').trim();
            try {
              html = new TextDecoder(rawCharset).decode(buffer);
            } catch {
              html = new TextDecoder(encoding).decode(buffer);
            }
          } else {
            html = new TextDecoder(encoding).decode(buffer);
          }

          // Check for garbled Chinese
          const cjkCount = (html.match(/[一-鿿]/g) || []).length;
          const accentCount = (html.match(/[À-ÿ]/g) || []).length;
          if (accentCount > 20 && cjkCount < 5) {
            // Try GBK
            html = new TextDecoder('gbk').decode(buffer);
            console.log(`  (GBK fallback applied)`);
          }

          // Strip HTML and show relevant sections
          const stripped = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();

          // Search for department-related text
          const deptKeywords = ['院系', '所属单位', '所在系', '学院', '部门', '单位', '系别', '机构'];
          console.log(`  --- Department keywords ---`);
          for (const kw of deptKeywords) {
            const idx = stripped.indexOf(kw);
            if (idx >= 0) {
              const snippet = stripped.substring(Math.max(0, idx - 10), idx + 60);
              console.log(`  "${kw}": ...${snippet}...`);
            }
          }

          // Search for bio/intro keywords
          const bioKeywords = ['个人简介', '个人简历', '教师简介', '简介', '研究方向', '个人介绍'];
          console.log(`  --- Bio keywords ---`);
          for (const kw of bioKeywords) {
            const idx = stripped.indexOf(kw);
            if (idx >= 0) {
              const snippet = stripped.substring(Math.max(0, idx - 10), idx + 120);
              console.log(`  "${kw}": ...${snippet}...`);
            }
          }

          // Title tag
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch) {
            console.log(`  <title>: ${titleMatch[1].trim()}`);
          }

        } catch (err) {
          console.log(`  Error: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

main();

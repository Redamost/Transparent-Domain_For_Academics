// Quick test: check which universities actually have working static HTML faculty lists
// Tests one list page per university and reports discoverable links
import 'dotenv/config';
import { getUniversityConfig } from '../src/lib/scraping/cn-university';

interface TestResult {
  key: string;
  name: string;
  listUrl: string;
  status: number | string;
  htmlSize: number;
  links: number;
  sampleNames: string[];
}

async function testUniversity(key: string): Promise<TestResult> {
  const uni = getUniversityConfig(key);
  if (!uni) return { key, name: '?', listUrl: '?', status: 'NOT_FOUND', htmlSize: 0, links: 0, sampleNames: [] };

  const listUrl = uni.facultyLists[0].url;
  try {
    const resp = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return { key, name: uni.nameZh, listUrl, status: resp.status, htmlSize: 0, links: 0, sampleNames: [] };
    }

    const html = await resp.text();
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Find links with Chinese names (likely teachers)
    const namePattern = /<a[^>]*href="([^"]*(?:\/info\/|\.html?|\.jsp|\/teacher\/|\/faculty\/|\/szdw\/|\/js\/)[^"]*)"[^>]*>\s*([一-鿿]{2,4})\s*<\/a>/gi;
    // Also check for <a> with any href that has Chinese name text
    const broadPattern = /<a[^>]*href="([^"]+)"[^>]*>\s*([一-鿿]{2,4})\s*<\/a>/gi;

    const teacherLinks: Array<{ href: string; name: string }> = [];
    let m;
    while ((m = namePattern.exec(html)) !== null) {
      if (m[1].includes('.edu.cn') || m[1].startsWith('/')) {
        teacherLinks.push({ href: m[1], name: m[2] });
      }
    }

    // Also try broad pattern to count total name links
    const broadLinks: string[] = [];
    while ((m = broadPattern.exec(html)) !== null) {
      broadLinks.push(m[2]);
    }

    // Check if the page has typical faculty list indicators
    const hasFacultyLabel = /师资|教师|教授|导师|人员|szdw|teacher|faculty/i.test(text.slice(0, 1000));
    const cjkCharCount = (text.match(/[一-鿿]/g) || []).length;
    const isProbablyChinese = cjkCharCount > 50;

    return {
      key,
      name: uni.nameZh,
      listUrl,
      status: resp.status,
      htmlSize: html.length,
      links: teacherLinks.length,
      sampleNames: [
        ...new Set(teacherLinks.map(l => l.name))
      ].slice(0, 8),
    };
  } catch (err) {
    return { key, name: uni.nameZh, listUrl, status: err instanceof Error ? err.message : 'Error', htmlSize: 0, links: 0, sampleNames: [] };
  }
}

async function main() {
  // Test universities that haven't been scraped yet (skip WHU, SYSU, JLU)
  const toTest = [
    // C9
    'tsinghua', 'pku', 'zju', 'fudan', 'sjtu', 'ustc', 'nju', 'hit', 'xjtu',
    // Other 985 — test a representative sample
    'hust', 'tongji', 'beihang', 'sichuan', 'seu', 'ruc',
    'nankai', 'tianjin', 'bit', 'dlut',
    'sdu', 'xmu', 'lzu', 'nwpu', 'scut',
    'csu', 'hnu', 'neu', 'cqu', 'ecnu',
    'bnu', 'uestc',
    // Newly added
    'cau', 'nudt', 'nwafu', 'muc', 'ouc',
  ];

  const results: TestResult[] = [];
  for (const key of toTest) {
    const r = await testUniversity(key);
    results.push(r);
    const icon = r.links > 5 ? '✅' : r.links > 0 ? '⚠️' : '❌';
    console.log(`${icon} ${r.name} (${r.key}): HTTP ${r.status}, ${r.htmlSize}B, ${r.links} teacher links`);
    if (r.links > 0 && r.links <= 20) {
      console.log(`   Names: ${r.sampleNames.join(', ')}`);
    }
    // Rate limit
    await new Promise(r_1 => setTimeout(r_1, 500));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  const working = results.filter(r => r.links > 5);
  const maybeWorking = results.filter(r => r.links > 0 && r.links <= 5);
  const broken = results.filter(r => r.links === 0);
  const dead = results.filter(r => r.status !== 200);

  console.log(`\n✅ Working (${working.length}): ${working.map(r => r.key).join(', ')}`);
  console.log(`⚠️  Maybe (${maybeWorking.length}): ${maybeWorking.map(r => r.key).join(', ')}`);
  console.log(`❌ No links (${broken.length}): ${broken.map(r => r.key).join(', ')}`);
  console.log(`💀 Dead URLs (${dead.length}): ${dead.map(r => `${r.key}(${r.status})`).join(', ')}`);
}

main().catch(console.error);

// Quick connectivity test for all remaining 985 university faculty list URLs
import 'dotenv/config';

// Universities with 0 scholars in DB
const TARGETS = [
  // key, name, first URL
  { key: 'hust', name: '华中科技大学', url: 'http://cs.hust.edu.cn/szdw.htm' },
  { key: 'tongji', name: '同济大学', url: 'https://cs.tongji.edu.cn/szdw/list.htm' },
  { key: 'beihang', name: '北京航空航天大学', url: 'https://scse.buaa.edu.cn/szdw/jcrc1.htm' },
  { key: 'sichuan', name: '四川大学', url: 'https://cs.scu.edu.cn/jzlm/szdw.htm' },
  { key: 'seu', name: '东南大学', url: 'https://cse.seu.edu.cn/101006608/list.htm' },
  { key: 'ruc', name: '中国人民大学', url: 'http://info.ruc.edu.cn/jsky/szdw/ajxjgcx/jsjkxyjsx1/js2/' },
  { key: 'nankai', name: '南开大学', url: 'https://cs.nankai.edu.cn/szdw/js.htm' },
  { key: 'tianjin', name: '天津大学', url: 'http://cic.tju.edu.cn/szdw.htm' },
  { key: 'bit', name: '北京理工大学', url: 'https://cs.bit.edu.cn/szdw/jsml/index.htm' },
  { key: 'dlut', name: '大连理工大学', url: 'https://faculty.dlut.edu.cn/xyjslb.jsp?urltype=tsites.CollegeTeacherList&wbtreeid=1003&st=0&id=1180&py=&lang=zh_CN&state=0' },
  { key: 'sdu', name: '山东大学', url: 'https://www.cs.sdu.edu.cn/szdw1/jcrc.htm' },
  { key: 'xmu', name: '厦门大学', url: 'https://cs.xmu.edu.cn/szll/jcrc.htm' },
  { key: 'lzu', name: '兰州大学', url: 'http://xxxy.lzu.edu.cn/szdw.htm' },
  { key: 'nwpu', name: '西北工业大学', url: 'https://jsj.nwpu.edu.cn/snew/szdw/szmd.htm' },
  { key: 'scut', name: '华南理工大学', url: 'https://www2.scut.edu.cn/cs/szdw/js.htm' },
  { key: 'csu', name: '中南大学', url: 'https://cse.csu.edu.cn/szdw/yjsds.htm' },
  { key: 'neu', name: '东北大学', url: 'http://www.cse.neu.edu.cn/6317/list.htm' },
  { key: 'cqu', name: '重庆大学', url: 'https://faculty.cqu.edu.cn/xyjslb.jsp?id=1135&lang=zh_CN' },
  { key: 'ecnu', name: '华东师范大学', url: 'https://cs.ecnu.edu.cn/szdw/list.htm' },
  { key: 'bnu', name: '北京师范大学', url: 'https://ai.bnu.edu.cn/szdw.htm' },
  { key: 'uestc', name: '电子科技大学', url: 'https://www.scse.uestc.edu.cn/szdw/js.htm' },
  { key: 'cau', name: '中国农业大学', url: 'https://ciee.cau.edu.cn/col/col50400/' },
  { key: 'nudt', name: '国防科技大学', url: 'https://www.nudt.edu.cn/xyjs/jsjxy/szdw.htm' },
  { key: 'nwafu', name: '西北农林科技大学', url: 'https://cie.nwsuaf.edu.cn/szdw/js/' },
  { key: 'muc', name: '中央民族大学', url: 'https://xingong.muc.edu.cn/szdw/xyjs.htm' },
  { key: 'ouc', name: '中国海洋大学', url: 'https://it.ouc.edu.cn/szdw/list.htm' },
];

interface Result {
  key: string;
  name: string;
  url: string;
  status: number | 'ERR';
  cjkCount: number;
  textLen: number;
  hasTeacherNames: boolean;
  verdict: 'STATIC_OK' | 'JS_SHELL' | 'DEAD' | 'TIMEOUT';
}

async function testUrl(target: typeof TARGETS[0]): Promise<Result> {
  const result: Result = {
    key: target.key,
    name: target.name,
    url: target.url,
    status: 'ERR',
    cjkCount: 0,
    textLen: 0,
    hasTeacherNames: false,
    verdict: 'DEAD',
  };

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);

    const resp = await fetch(target.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    clearTimeout(timeout);

    result.status = resp.status;
    if (resp.status !== 200) {
      result.verdict = 'DEAD';
      return result;
    }

    // Check content-type for HTML
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      // Could still be HTML, try reading
    }

    const buffer = await resp.arrayBuffer();

    // Try UTF-8 first
    let text = new TextDecoder('utf-8').decode(buffer);

    // Check for garbled Chinese (GBK served as UTF-8)
    const gbkMarkers = (text.match(/[鏄鐨涓鏂鍏鑳鎵鐢闄鑷鍒浠榛鎴绉鎹绠绔圭被]/g) || []).length;
    if (gbkMarkers > 10) {
      // Try GBK
      text = new TextDecoder('gbk').decode(buffer);
    }

    result.textLen = text.length;
    result.cjkCount = (text.match(/[一-鿿]/g) || []).length;

    // Check if it's a JS shell (very few CJK characters, lots of JS)
    const jsDensity = (text.match(/\b(?:function|const|let|var|require|import|export|\.js|\.tsx?|\.vue|__webpack|__NEXT|_next|react|vue|angular)\b/g) || []).length;
    const scriptCount = (text.match(/<script[^>]*>/g) || []).length;

    // Check for teacher names
    const nameMatches = text.match(/[一-鿿]{2,4}(?=\s*(?:教授|副教授|讲师|研究员|博导|硕导))/g) || [];
    result.hasTeacherNames = nameMatches.length > 3;

    if (result.cjkCount < 100 && scriptCount > 3) {
      result.verdict = 'JS_SHELL';
    } else if (result.cjkCount < 50) {
      result.verdict = 'DEAD';
    } else if (result.hasTeacherNames || result.cjkCount > 500) {
      result.verdict = 'STATIC_OK';
    } else {
      result.verdict = 'JS_SHELL'; // Has content but no teacher names
    }

  } catch (err: any) {
    if (err.name === 'AbortError') {
      result.verdict = 'TIMEOUT';
    } else {
      result.verdict = 'DEAD';
    }
  }

  return result;
}

async function main() {
  console.log('Testing connectivity for 26 universities with 0 data...\n');

  // Test 5 at a time to avoid network congestion
  const results: Result[] = [];
  for (let i = 0; i < TARGETS.length; i += 5) {
    const batch = TARGETS.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(testUrl));
    results.push(...batchResults);

    // Progress
    for (const r of batchResults) {
      const icon = r.verdict === 'STATIC_OK' ? '✅' : r.verdict === 'JS_SHELL' ? '🔶' : r.verdict === 'TIMEOUT' ? '⏱️' : '❌';
      console.log(`${icon} ${r.name} (${r.key}): ${r.verdict} | status=${r.status} | CJK=${r.cjkCount} | text=${r.textLen}B | names=${r.hasTeacherNames}`);
    }
    // Small delay between batches
    if (i + 5 < TARGETS.length) await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  const staticOk = results.filter(r => r.verdict === 'STATIC_OK');
  const jsShell = results.filter(r => r.verdict === 'JS_SHELL');
  const dead = results.filter(r => r.verdict === 'DEAD' || r.verdict === 'TIMEOUT');

  console.log(`\n${'='.repeat(55)}`);
  console.log(`SUMMARY:`);
  console.log(`  ✅ STATIC_OK: ${staticOk.length} — can use targeted-scrape.ts`);
  console.log(`  🔶 JS_SHELL:  ${jsShell.length} — need Playwright`);
  console.log(`  ❌ DEAD:      ${dead.length} — need new URLs`);

  if (staticOk.length > 0) {
    console.log(`\nSTATIC_OK universities:`);
    for (const r of staticOk) console.log(`  ${r.name} → ${r.url}`);
  }
  if (jsShell.length > 0) {
    console.log(`\nJS_SHELL universities:`);
    for (const r of jsShell) console.log(`  ${r.name} → ${r.url}`);
  }
  if (dead.length > 0) {
    console.log(`\nDEAD universities:`);
    for (const r of dead) console.log(`  ${r.name} → ${r.url} (status=${r.status})`);
  }
}

main().catch(console.error);

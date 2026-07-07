// Verify newly discovered URLs for dead universities
import 'dotenv/config';

const TESTS: Array<{ key: string; url: string }> = [
  // nwpu - 西北工业大学
  { key: 'nwpu', url: 'https://jsj.nwpu.edu.cn/snew/szdw/szmd.htm' },
  { key: 'nwpu', url: 'https://jsj.nwpu.edu.cn/snew/szdwlist.jsp?a238672c=10&a238672p=1&a238672t=2&wbtreeid=1531' },
  // beihang - 北航
  { key: 'beihang', url: 'https://scse.buaa.edu.cn/szdw/jcrc1.htm' },
  { key: 'beihang', url: 'https://scse.buaa.edu.cn/info/1387/10321.htm' },
  // neu - 东北大学
  { key: 'neu', url: 'http://www.cse.neu.edu.cn/6317/list.htm' },
  // nwafu - 西北农林 (correct domain: nwsuaf.edu.cn)
  { key: 'nwafu', url: 'https://cie.nwsuaf.edu.cn/szdw/js/' },
  // xidian - 西电
  { key: 'xidian', url: 'https://cs.xidian.edu.cn/yjsjy/dsjies.htm' },
  // bnu - 北师大
  { key: 'bnu', url: 'https://ai.bnu.edu.cn/xygk/szdw/' },
  // tongji - 同济
  { key: 'tongji', url: 'https://cs.tongji.edu.cn/szdw/js.htm' },
  // hust - 华科
  { key: 'hust', url: 'https://cs.hust.edu.cn/szdw.htm' },
  // ecnu - 华东师大
  { key: 'ecnu', url: 'https://cs.ecnu.edu.cn/' },
  // nju - 南大
  { key: 'nju', url: 'https://cs.nju.edu.cn/' },
  // dlut - 大连理工
  { key: 'dlut', url: 'https://faculty.dlut.edu.cn/xyjslb.jsp?urltype=tsites.CollegeTeacherList&wbtreeid=1003&st=0&id=1180&py=&lang=zh_CN&state=0' },
  // cau - 中国农大
  { key: 'cau', url: 'https://ciee.cau.edu.cn/col/col50400/' },
  // cas - 中科院
  { key: 'cas', url: 'http://www.ict.ac.cn/yjdw/' },
];

async function main() {
  console.log('Verifying newly discovered URLs...\n');

  for (const { key, url } of TESTS) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
      const html = await resp.text();
      const cjkCount = (html.match(/[一-鿿]/g) || []).length;
      const scriptCount = (html.match(/<script[^>]*>/gi) || []).length;
      const icon = resp.ok ? (cjkCount > 50 ? '✅' : '⚠️') : '❌';
      const jsLabel = (cjkCount < 20 && scriptCount > 3) ? ' [JS]' : '';
      console.log(`${icon} ${key.padEnd(10)} HTTP${resp.status} ${(html.length/1024).toFixed(0)}KB CJK:${cjkCount}${jsLabel}  ${url}`);
    } catch (err) {
      console.log(`❌ ${key.padEnd(10)} FAILED: ${err instanceof Error ? err.message.slice(0, 50) : String(err)}  ${url}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }
}

main().catch(console.error);

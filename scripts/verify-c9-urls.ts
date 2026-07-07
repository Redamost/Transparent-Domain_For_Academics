// Verify newly discovered C9 university URLs
import 'dotenv/config';

const TESTS: Array<{ key: string; url: string; note: string }> = [
  // HIT: correct URL is /11261/list.htm not /szdw/list.htm
  { key: 'hit', url: 'http://computing.hit.edu.cn/11261/list.htm', note: '师资队伍主页面' },
  { key: 'hit', url: 'http://computing.hit.edu.cn/11261/list2.htm', note: '师资队伍第2页' },
  // XJTU: correct URL is /szdw/jsml.htm not /szdw/js.htm
  { key: 'xjtu', url: 'http://www.cs.xjtu.edu.cn/szdw/jsml.htm', note: '教师名录主站' },
  { key: 'xjtu', url: 'http://www.cs.xjtu.edu.cn/szdw/jsml/jsjqt.htm', note: '讲师及其他' },
  // ZJU: teacher directory
  { key: 'zju', url: 'http://www.cs.zju.edu.cn/csen/27003/list.htm', note: '教师名录' },
  // PKU: try different pages
  { key: 'pku', url: 'https://cs.pku.edu.cn/gywm/gk.htm', note: '学院概况-含师资' },
  { key: 'pku', url: 'https://cs.pku.edu.cn/info/1265/3293.htm', note: '招生导师名单' },
  // NJU: try individual profile pattern
  { key: 'nju', url: 'https://cs.nju.edu.cn/', note: '主页' },
  { key: 'nju', url: 'https://cs.nju.edu.cn/szdw/list.htm', note: 'try list.htm' },
  // USTC
  { key: 'ustc', url: 'https://cs.ustc.edu.cn/szdw/list.htm', note: 'CS faculty list' },
  { key: 'ustc', url: 'https://math.ustc.edu.cn/ys/list.htm', note: 'Math 院士' },
  // Fudan: alternative URLs
  { key: 'fudan', url: 'https://cs.fudan.edu.cn/szdw/js.htm', note: '教师列表' },
  { key: 'fudan', url: 'https://cs.fudan.edu.cn/teacher/list.htm', note: '教师列表2' },
  // SJTU: alternative
  { key: 'sjtu', url: 'https://www.cs.sjtu.edu.cn/teacherlist.html', note: '教师列表' },
  { key: 'sjtu', url: 'https://infosec.sjtu.edu.cn/faculty', note: '网安学院师资' },
];

async function main() {
  console.log('Verifying C9 URLs...\n');

  for (const { key, url, note } of TESTS) {
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
      const cjk = (html.match(/[一-鿿]/g) || []).length;
      const scripts = (html.match(/<script[^>]*>/gi) || []).length;
      const sizeKB = (html.length / 1024).toFixed(0);
      const jsLabel = (cjk < 20 && scripts > 3) ? ' 🔧JS' : '';
      const icon = resp.ok ? (cjk > 50 ? '✅' : (cjk > 10 ? '⚠️' : '🔧')) : '❌';
      console.log(`${icon} ${key.padEnd(8)} HTTP${resp.status} ${sizeKB}KB CJK:${cjk}${jsLabel}  ${note}`);
      console.log(`        ${url}`);
    } catch (err) {
      console.log(`❌ ${key.padEnd(8)} FAILED: ${err instanceof Error ? err.message.slice(0, 40) : String(err)}  ${note}`);
    }
    await new Promise(r => setTimeout(r, 600));
  }
}

main().catch(console.error);

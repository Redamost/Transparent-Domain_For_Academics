import 'dotenv/config';

async function test(url: string, label: string) {
  try {
    const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'zh-CN'},signal:AbortSignal.timeout(15000),redirect:'follow'});
    const h = await r.text();
    const cjk = (h.match(/[一-鿿]/g)||[]).length;
    const sc = (h.match(/<script[^>]*>/gi)||[]).length;
    console.log(label + ': HTTP' + r.status + ' ' + (h.length/1024).toFixed(0) + 'KB CJK:' + cjk + ' Scripts:' + sc);
    if (cjk < 20 && sc > 3) console.log('  ⚠️ JS-RENDERED');
  } catch(e: any) { console.log(label + ': FAIL ' + (e.message?.slice(0,50)||'')); }
}

async function main() {
  await test('https://cs.pku.edu.cn/szdw/jyxl/amz/ALL.htm', 'PKU ALL');
  await test('https://www.cs.sjtu.edu.cn/teacherlist.html', 'SJTU teacherlist');
}
main();

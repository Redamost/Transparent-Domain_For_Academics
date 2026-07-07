import "dotenv/config";
import { inferFieldsFromSource } from "../src/lib/scraping/field-inference";

const testUrls = [
  "http://jszy.whu.edu.cn/qutao_cs/zh_CN/index.htm",
  "https://cse.sysu.edu.cn/teacher/WangChangdong",
  "https://www.cs.tsinghua.edu.cn/szzk/../info/1111/3489.htm",
  "http://csee.hnu.edu.cn/people/chenjuan",
  "https://cs.pku.edu.cn/szdw/jyxl/amz/ALL.htm",
  "https://www.ee.tsinghua.edu.cn/szdw.htm",
  "https://math.nankai.edu.cn/szdw/js.htm",
  "https://physics.bit.edu.cn/szdw/js.htm",
  "https://cs.scu.edu.cn/jzlm/szdw.htm",
  "http://ee.jlu.edu.cn/szdw/js.htm",
  "https://scse.buaa.edu.cn/szdw/jcrc1.htm",
  "https://www2.scut.edu.cn/cs/szdw/js.htm",
  "https://cse.csu.edu.cn/szdw/yjsds.htm",
  "http://info.ruc.edu.cn/jsky/szdw/ajxjgcx/jsjkxyjsx1/js2/",
  "http://stat.ruc.edu.cn/szdw/js.htm",
  "https://person.zju.edu.cn/index/search",
  "https://faculty.dlut.edu.cn/xyjslb.jsp",
  "https://dianyuan.nwpu.edu.cn/szdw.htm",
];

for (const url of testUrls) {
  const fields = inferFieldsFromSource(null, url);
  console.log(`URL: ${url.substring(0, 60)}...`);
  console.log(`  → ${fields.length > 0 ? fields.join(", ") : "NO MATCH"}`);
}

process.exit(0);

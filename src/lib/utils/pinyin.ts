// ─── Chinese-to-Pinyin Name Converter ───
// Maps ~500 most common Chinese surname/given-name characters to pinyin.
// Used for generating English name guesses when no English name is available.

/** Deduplicated character-to-pinyin map. First-occurrence wins (surname priority). */
export const PINYIN_MAP: Record<string, string> = {
  // ─── Surnames (top 300+) ───
  '王':'Wang','李':'Li','张':'Zhang','刘':'Liu','陈':'Chen','杨':'Yang','黄':'Huang','赵':'Zhao','吴':'Wu','周':'Zhou',
  '徐':'Xu','孙':'Sun','马':'Ma','朱':'Zhu','胡':'Hu','郭':'Guo','何':'He','高':'Gao','林':'Lin','罗':'Luo',
  '郑':'Zheng','梁':'Liang','谢':'Xie','宋':'Song','唐':'Tang','许':'Xu','韩':'Han','冯':'Feng','邓':'Deng','曹':'Cao',
  '彭':'Peng','曾':'Zeng','肖':'Xiao','田':'Tian','董':'Dong','潘':'Pan','袁':'Yuan','蔡':'Cai','蒋':'Jiang','余':'Yu',
  '于':'Yu','杜':'Du','叶':'Ye','程':'Cheng','苏':'Su','魏':'Wei','吕':'Lv','丁':'Ding','任':'Ren','沈':'Shen',
  '姚':'Yao','卢':'Lu','姜':'Jiang','崔':'Cui','钟':'Zhong','谭':'Tan','陆':'Lu','汪':'Wang','范':'Fan','金':'Jin',
  '石':'Shi','廖':'Liao','贾':'Jia','夏':'Xia','韦':'Wei','付':'Fu','方':'Fang','白':'Bai','邹':'Zou','孟':'Meng',
  '熊':'Xiong','秦':'Qin','邱':'Qiu','江':'Jiang','尹':'Yin','薛':'Xue','闫':'Yan','段':'Duan','雷':'Lei','侯':'Hou',
  '龙':'Long','史':'Shi','陶':'Tao','黎':'Li','贺':'He','顾':'Gu','毛':'Mao','郝':'Hao','龚':'Gong','邵':'Shao',
  '万':'Wan','钱':'Qian','严':'Yan','覃':'Qin','武':'Wu','戴':'Dai','莫':'Mo','孔':'Kong','向':'Xiang','汤':'Tang',
  '温':'Wen','常':'Chang','康':'Kang','施':'Shi','文':'Wen','牛':'Niu','樊':'Fan','葛':'Ge','邢':'Xing','安':'An',
  '齐':'Qi','易':'Yi','乔':'Qiao','伍':'Wu','庞':'Pang','颜':'Yan','倪':'Ni','庄':'Zhuang','聂':'Nie','章':'Zhang',
  '鲁':'Lu','岳':'Yue','翟':'Zhai','殷':'Yin','詹':'Zhan','申':'Shen','欧':'Ou','耿':'Geng','关':'Guan','兰':'Lan',
  '焦':'Jiao','俞':'Yu','柳':'Liu','甘':'Gan','祝':'Zhu','包':'Bao','宁':'Ning','尚':'Shang','符':'Fu','柯':'Ke',
  '阮':'Ruan','尤':'You','凌':'Ling','毕':'Bi','单':'Shan','项':'Xiang','季':'Ji','童':'Tong','纪':'Ji','舒':'Shu',
  '屈':'Qu','成':'Cheng','游':'You','阳':'Yang','裴':'Pei','席':'Xi','卫':'Wei','查':'Zha','鲍':'Bao','霍':'Huo',
  '翁':'Weng','隋':'Sui','薄':'Bo','闵':'Min','路':'Lu','解':'Xie','管':'Guan','宗':'Zong','盛':'Sheng',
  '连':'Lian','荣':'Rong','邬':'Wu','祁':'Qi','穆':'Mu','谈':'Tan','应':'Ying','饶':'Rao','曲':'Qu','娄':'Lou',
  '瞿':'Qu','迟':'Chi','刁':'Diao','桑':'Sang','吉':'Ji','景':'Jing','靳':'Jin','厉':'Li','骆':'Luo','米':'Mi',
  '房':'Fang','边':'Bian','辜':'Gu','丰':'Feng','冷':'Leng','花':'Hua','缪':'Miao','商':'Shang','古':'Gu','敖':'Ao',
  '简':'Jian','阙':'Que','涂':'Tu','窦':'Dou','左':'Zuo','匡':'Kuang','寇':'Kou','卓':'Zhuo','姬':'Ji','车':'Che',
  // ─── Given name characters (extensive, deduplicated) ───
  '伟':'Wei','芳':'Fang','娜':'Na','秀':'Xiu','英':'Ying','敏':'Min','静':'Jing','丽':'Li','强':'Qiang','磊':'Lei',
  '军':'Jun','洋':'Yang','勇':'Yong','艳':'Yan','杰':'Jie','娟':'Juan','涛':'Tao','明':'Ming','超':'Chao','华':'Hua',
  '慧':'Hui','鑫':'Xin','平':'Ping','刚':'Gang','桂':'Gui','春':'Chun','建':'Jian','玲':'Ling','振':'Zhen',
  '辉':'Hui','鹏':'Peng','浩':'Hao','波':'Bo','飞':'Fei','峰':'Feng','海':'Hai','博':'Bo',
  '宇':'Yu','晨':'Chen','雪':'Xue','佳':'Jia','欣':'Xin','怡':'Yi','婷':'Ting','悦':'Yue','萌':'Meng','然':'Ran',
  '晓':'Xiao','亚':'Ya','志':'Zhi','国':'Guo','庆':'Qing','正':'Zheng','宏':'Hong','新':'Xin','永':'Yong','少':'Shao',
  '俊':'Jun','东':'Dong','云':'Yun','天':'Tian','亮':'Liang','瑞':'Rui','思':'Si','维':'Wei','恒':'Heng',
  '燕':'Yan','晶':'Jing','洁':'Jie','萍':'Ping','梅':'Mei','蕾':'Lei','丹':'Dan','霞':'Xia','玉':'Yu','璐':'Lu',
  '莹':'Ying','凡':'Fan','森':'Sen','毅':'Yi','泽':'Ze','翔':'Xiang','帅':'Shuai','威':'Wei','斌':'Bin',
  '旭':'Xu','源':'Yuan','根':'Gen','发':'Fa','德':'De','福':'Fu','寿':'Shou',
  '祥':'Xiang','如':'Ru','意':'Yi','富':'Fu','贵':'Gui','和':'He','美':'Mei','仁':'Ren','义':'Yi',
  '礼':'Li','智':'Zhi','信':'Xin','忠':'Zhong','孝':'Xiao','良':'Liang','真':'Zhen','善':'Shan','爱':'Ai','民':'Min',
  '家':'Jia','兴':'Xing','隆':'Long','世':'Shi','昌':'Chang','茂':'Mao','旺':'Wang','顺':'Shun','利':'Li',
  '双':'Shuang','全':'Quan','通':'Tong','达':'Da','进':'Jin','取':'Qu','升':'Sheng','登':'Deng','科':'Ke',
  '学':'Xue','才':'Cai','能':'Neng','力':'Li','功':'Gong','名':'Ming','禄':'Lu','权':'Quan','位':'Wei',
  '清':'Qing','风':'Feng','星':'Xing','月':'Yue','日':'Ri','光':'Guang',
  '山':'Shan','水':'Shui','木':'Mu','火':'Huo','土':'Tu','禾':'He',
  '草':'Cao','树':'Shu','枝':'Zhi','果':'Guo','实':'Shi','苗':'Miao','种':'Zhong',
  '凤':'Feng','鹤':'He','莺':'Ying','鸿':'Hong','雁':'Yan','鹰':'Ying','虎':'Hu',
  '羊':'Yang','鹿':'Lu','骏':'Jun','骅':'Hua','驹':'Ju','麒':'Qi','麟':'Lin',
  '哲':'Zhe','圣':'Sheng','贤':'Xian','道':'Dao','法':'Fa','术':'Shu','艺':'Yi','技':'Ji','巧':'Qiao',
  '硕':'Shuo','渊':'Yuan','深':'Shen','远':'Yuan','广':'Guang','大':'Da','宽':'Kuan','厚':'Hou','重':'Zhong',
  '雅':'Ya','颂':'Song','诗':'Shi','词':'Ci','书':'Shu','画':'Hua','琴':'Qin','棋':'Qi','赋':'Fu',
  '豪':'Hao','雄':'Xiong','壮':'Zhuang','烈':'Lie','猛':'Meng',
  '竹':'Zhu','菊':'Ju','莲':'Lian','荷':'He','松':'Song','柏':'Bai',
  '红':'Hong','橙':'Cheng','绿':'Lv','青':'Qing','蓝':'Lan','紫':'Zi','翠':'Cui','碧':'Bi',
  '一':'Yi','二':'Er','三':'San','四':'Si','五':'Wu','六':'Liu','七':'Qi','八':'Ba','九':'Jiu','十':'Shi',
  '百':'Bai','千':'Qian','亿':'Yi','兆':'Zhao','元':'Yuan','圆':'Yuan','长':'Chang','久':'Jiu',
  '朝':'Chao','夕':'Xi','昔':'Xi','今':'Jin','中':'Zhong','汉':'Han',
  '之':'Zhi','的':'De','了':'Le','是':'Shi','我':'Wo','你':'Ni','他':'Ta','她':'Ta','它':'Ta',
  '著':'Zhu','作':'Zuo','论':'Lun','说':'Shuo','讲':'Jiang','议':'Yi','评':'Ping','辩':'Bian','证':'Zheng',
  '创':'Chuang','造':'Zao','现':'Xian','研':'Yan','究':'Jiu','探':'Tan','索':'Suo','求':'Qiu','知':'Zhi',
  '润':'Run','涵':'Han','沛':'Pei','沐':'Mu','溪':'Xi','泉':'Quan','霖':'Lin','霏':'Fei','雯':'Wen',
  '瑾':'Jin','瑜':'Yu','瑶':'Yao','璇':'Xuan','琛':'Chen','琦':'Qi','琪':'Qi','琬':'Wan','琰':'Yan','琨':'Kun',
  '弘':'Hong','谦':'Qian','谨':'Jin','诚':'Cheng','朴':'Pu','素':'Su',
  '凯':'Kai','旋':'Xuan','胜':'Sheng','捷':'Jie','赢':'Ying','冠':'Guan','魁':'Kui','首':'Shou','领':'Ling','先':'Xian',
};

/**
 * Generate pinyin from a Chinese name.
 * Uses a CJK character-to-pinyin lookup map (~500 common characters).
 * Returns null if the name is too short or contains no CJK characters.
 */
export function generatePinyinFromChinese(chineseName: string): string | null {
  if (!chineseName || chineseName.length < 2) return null;

  // Remove non-CJK characters
  const chars = chineseName.replace(/[^一-鿿]/g, '');
  if (chars.length < 2) return null;

  const surname = PINYIN_MAP[chars[0]] || chars[0];
  const givenParts = chars.slice(1).split('').map(c => PINYIN_MAP[c] || c);
  const given = givenParts.join('');

  // Chinese name format: Surname Given (e.g., Wang Xiaoming)
  return `${surname} ${given}`;
}
